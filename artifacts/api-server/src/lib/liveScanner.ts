/**
 * CSAM Phase 3b-B1 — Real-time live stream sampler.
 *
 * For each ACTIVE live stream, grabs one frame from the public HLS URL every
 * CSAM_LIVE_SAMPLE_INTERVAL_SEC seconds (default 10) and scans it through Hive.
 *
 *  - HIT  → broadcast terminated immediately (completeMuxLiveStream) + stream
 *            marked blocked + needsNcmecReport via blockLiveStream (which also
 *            inserts preservation holds and notifies admins). Sampling stops.
 *  - CLEAN → schedule next sample. No broadcaster-visible change.
 *  - ERROR → log + retry next interval. NEVER kill on error.
 *
 * Frame URLs are never exposed to clients. The temporary R2 object used to give
 * Hive a scannable URL is deleted immediately after the scan.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { CSAM_SCAN_ENABLED, scanFrameUrl, blockLiveStream } from "./csam";
import { completeMuxLiveStream, mintMuxJwt } from "./mux";
import { putR2Object, getPresignedDownloadUrl, deleteR2Object } from "./r2";

// ── Config ────────────────────────────────────────────────────────────────────

const LIVE_INTERVAL_MS =
  Math.max(5, Number(process.env.CSAM_LIVE_SAMPLE_INTERVAL_SEC ?? "10")) * 1000;

/** Maximum backoff delay for persistent scan errors (~5 min). */
const LIVE_BACKOFF_CAP_MS = 5 * 60 * 1000;

// ── State ─────────────────────────────────────────────────────────────────────

interface ScanState {
  aborted: boolean;
  muxPlaybackId: string;
  muxLiveStreamId: string;
  /** Consecutive error count for exponential backoff. Reset to 0 on a clean scan. */
  errorCount: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Per-stream interval override (ms). Can only be tightened, never loosened. */
  intervalMs: number;
}

const active = new Map<number, ScanState>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start background frame sampling for a live stream.
 * No-op if CSAM scanning is disabled or the stream is already being sampled.
 * First sample fires after one full interval to let the broadcast stabilise.
 */
export function startLiveScan(
  streamId: number,
  muxPlaybackId: string,
  muxLiveStreamId: string,
): void {
  if (!CSAM_SCAN_ENABLED) return;
  if (active.has(streamId)) return;

  const state: ScanState = { aborted: false, muxPlaybackId, muxLiveStreamId, errorCount: 0, intervalMs: LIVE_INTERVAL_MS };
  active.set(streamId, state);
  scheduleNext(streamId, state, LIVE_INTERVAL_MS);
  logger.info({ streamId, intervalMs: LIVE_INTERVAL_MS }, "live-scanner: started");
}

/**
 * Tighten the per-stream frame-sampling interval.
 * Called when a viewer submits an underage_csam report for a live stream.
 * Only tightens (smaller value = more frequent sampling); never loosens.
 * No-op if CSAM scanning is disabled or if this stream is not being sampled.
 */
export function tightenSamplerInterval(streamId: number, newIntervalMs: number): void {
  const state = active.get(streamId);
  if (!state) return;
  if (newIntervalMs >= state.intervalMs) return;
  state.intervalMs = newIntervalMs;
  logger.info({ streamId, newIntervalMs }, "live-scanner: sampler interval tightened by report");
}

/**
 * Stop background frame sampling for a stream.
 * Safe to call multiple times or for a stream that was never started.
 */
export function stopLiveScan(streamId: number): void {
  const state = active.get(streamId);
  if (!state) return;
  state.aborted = true;
  if (state.timer) clearTimeout(state.timer);
  active.delete(streamId);
  logger.info({ streamId }, "live-scanner: stopped");
}

// ── Loop internals ────────────────────────────────────────────────────────────

function scheduleNext(streamId: number, state: ScanState, delayMs: number): void {
  if (state.aborted) return;
  state.timer = setTimeout(() => {
    if (state.aborted) return;
    runOneScan(streamId, state).catch((err) => {
      if (state.aborted) return;
      logger.error({ err, streamId }, "live-scanner: unexpected loop error, retrying");
      scheduleNext(streamId, state, state.intervalMs);
    });
  }, delayMs);
}

async function runOneScan(streamId: number, state: ScanState): Promise<void> {
  const { muxPlaybackId, muxLiveStreamId } = state;

  let r2Key: string | null = null;

  // ── Frame extraction + R2 upload ───────────────────────────────────────────
  let presignedUrl: string;
  try {
    const frame = await grabOneFrame(muxPlaybackId);
    if (state.aborted) return;

    r2Key = `temp-csam-live/${streamId}/${randomUUID()}.jpg`;
    await putR2Object("private", r2Key, frame, "image/jpeg");

    presignedUrl = await getPresignedDownloadUrl(r2Key, 60);
  } catch (err) {
    // Frame grab or R2 error — log and retry with backoff; NEVER kill the broadcast.
    logger.warn({ err: (err as Error).message, streamId }, "live-scanner: frame grab/upload error, retrying");
    if (r2Key) deleteR2Object("private", r2Key).catch(() => {});
    scheduleNext(streamId, state, nextBackoffMs(state));
    return;
  }

  // ── Hive scan ─────────────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof scanFrameUrl>>;
  try {
    result = await scanFrameUrl(presignedUrl);
  } catch (err) {
    // Unexpected throw from scanFrameUrl — treat as error, never kill.
    logger.warn({ err: (err as Error).message, streamId }, "live-scanner: scanFrameUrl threw, retrying");
    deleteR2Object("private", r2Key).catch(() => {});
    scheduleNext(streamId, state, nextBackoffMs(state));
    return;
  } finally {
    // Always clean up the temp R2 frame object.
    deleteR2Object("private", r2Key).catch(() => {});
  }

  if (state.aborted) return;

  // ── Act on result ─────────────────────────────────────────────────────────
  if (result.outcome === "hit") {
    logger.warn(
      { streamId, muxLiveStreamId, hashMatch: result.hashMatch, csamScore: result.csamScore },
      "live-scanner: CSAM HIT — terminating broadcast",
    );
    // Stop the loop first so no further samples fire.
    stopLiveScan(streamId);
    // Kill the broadcast, then persist the block (holds + admin alert inside blockLiveStream).
    await completeMuxLiveStream(muxLiveStreamId);
    await blockLiveStream(streamId, {
      raw: result.raw,
      hashMatch: result.hashMatch,
      csamScore: result.csamScore,
    });
  } else if (result.outcome === "error") {
    // Hive error — never kill; back off exponentially, capped at LIVE_BACKOFF_CAP_MS.
    logger.warn(
      { streamId, reason: result.reason, errorCount: state.errorCount },
      "live-scanner: Hive error, backing off",
    );
    scheduleNext(streamId, state, nextBackoffMs(state));
  } else {
    // Clean — reset error counter and schedule next sample at the normal interval.
    state.errorCount = 0;
    logger.debug({ streamId }, "live-scanner: frame clean");
    scheduleNext(streamId, state, state.intervalMs);
  }
}

/**
 * Compute the next retry delay using exponential backoff, then increment the
 * stream's error counter. Backoff: LIVE_INTERVAL_MS × 2^errorCount, capped at
 * LIVE_BACKOFF_CAP_MS (~5 min). Resetting errorCount to 0 on a clean scan
 * returns the sampler to the normal cadence.
 */
function nextBackoffMs(state: ScanState): number {
  const delayMs = Math.min(LIVE_INTERVAL_MS * Math.pow(2, state.errorCount), LIVE_BACKOFF_CAP_MS);
  state.errorCount += 1;
  return delayMs;
}

/**
 * Extract a single JPEG frame from the live HLS stream via ffmpeg.
 * Mints a server-side signed token for the (now signed-policy) live playback ID.
 * The URL and token are constructed server-side and never returned to any client.
 * Throws if token minting or ffmpeg fails (caller treats this as a retriable error).
 */
async function grabOneFrame(muxPlaybackId: string): Promise<Buffer> {
  // Mint a 2-minute signed token — long enough for the ffmpeg probe + frame grab.
  // Throws if MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY are not set.
  const token = mintMuxJwt(muxPlaybackId, "v", 120);
  const hlsUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8?token=${token}`;
  const tmpDir = join(tmpdir(), `csam-live-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const outPath = join(tmpDir, "frame.jpg");

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        // libavformat connection/read timeout (microseconds) — prevents hanging on a slow feed.
        "-timeout", "20000000",
        "-i", hlsUrl,
        "-frames:v", "1",
        "-q:v", "5",
        outPath,
      ];
      execFile("ffmpeg", args, { timeout: 30_000 }, (err) => {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
          reject(new Error("ffmpeg binary not found"));
          return;
        }
        // Non-zero exit is acceptable when the output file was produced
        // (ffmpeg can exit non-zero after a successful single-frame grab from HLS).
        resolve();
      });
    });

    // readFile throws ENOENT if ffmpeg exited before writing the frame.
    return await readFile(outPath);
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
