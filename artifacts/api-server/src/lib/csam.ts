import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import {
  db,
  postsTable,
  messagesTable,
  merchProductsTable,
  auctionsTable,
  usersTable,
  notificationsTable,
  streamsTable,
  preservationHoldsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPresignedDownloadUrl, r2KeyFromPublicUrl, r2KeyFromStagedUrl, putR2Object, deleteR2ObjectsByPrefix, r2KeyExtract } from "./r2";
import { uploadImageFromBytes, getOrCreateShop, createProduct, publishProduct } from "./printify";
import { createTempPublicPlaybackId, deleteAssetPlaybackId } from "./mux";

// ── Config ───────────────────────────────────────────────────────────────────

export const CSAM_SCAN_ENABLED = process.env.CSAM_SCAN_ENABLED !== "false";
const CSAM_BLOCK_THRESHOLD = Number(process.env.CSAM_BLOCK_THRESHOLD ?? "0.9");

/** Seconds between sampled video frames. Higher = fewer frames = cheaper. Default: 2. */
const CSAM_VIDEO_SAMPLE_INTERVAL_SEC = Math.max(1, Number(process.env.CSAM_VIDEO_SAMPLE_INTERVAL_SEC ?? "2"));

/** Hard cap on sampled frames per video. If natural count exceeds this, frames are distributed
 *  evenly across the full duration so no section is skipped. Default: 60. */
const CSAM_VIDEO_MAX_FRAMES = Math.max(1, Number(process.env.CSAM_VIDEO_MAX_FRAMES ?? "60"));

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetType = "post" | "dm_message" | "merch_product" | "auction" | "avatar" | "banner" | "stream_recording";

export type HiveResult =
  | { outcome: "clean"; raw: unknown }
  | { outcome: "hit"; raw: unknown; hashMatch: boolean; csamScore: number }
  | { outcome: "error"; reason: string };

type VideoScanResult =
  | { outcome: "clean" }
  | { outcome: "hit"; hit: Extract<HiveResult, { outcome: "hit" }> }
  | { outcome: "error"; reason: string };

/**
 * Describes the scannable media on an asset.
 *
 * - images:     one or more image refs to scan. muxAssetId is non-null when a
 *               Mux video is also present — Phase 3a scans it by frame sampling.
 * - no_media:   no scannable content → auto-clean.
 * - video_only: only video, no separate still image. muxAssetId is non-null for
 *               Mux assets (Phase 3a); null for non-Mux videos (stay pending).
 */
type MediaRefs =
  | { kind: "images"; refs: string[]; muxAssetId: string | null }
  | { kind: "no_media" }
  | { kind: "video_only"; muxAssetId: string | null };

// ── In-memory retry state (bounded exponential backoff) ──────────────────────

const retryState = new Map<string, { attempts: number; nextRetryAt: number }>();

// ── Exported entry points ────────────────────────────────────────────────────

export async function scanAsset(assetId: number, assetType: AssetType = "post"): Promise<void> {
  const hiveApiKey = process.env.HIVE_CSAM_API_KEY ?? "";

  if (!CSAM_SCAN_ENABLED || !hiveApiKey) {
    logger.info(
      { assetId, assetType, enabled: CSAM_SCAN_ENABLED, hasKey: !!hiveApiKey },
      "csam: scan disabled or HIVE_CSAM_API_KEY absent — leaving pending (fail-closed)",
    );
    return;
  }

  // Idempotency — never re-process a terminal state
  const currentStatus = await getAssetScanStatus(assetId, assetType);
  if (currentStatus === "blocked" || currentStatus === "clean") {
    logger.info({ assetId, assetType, currentStatus }, "csam: already decided — skipping");
    return;
  }

  // Retry throttle (backoff not yet expired)
  const retryKey = `${assetType}:${assetId}`;
  const retry = retryState.get(retryKey);
  if (retry && Date.now() < retry.nextRetryAt) {
    logger.info(
      { assetId, assetType, nextRetryAt: new Date(retry.nextRetryAt).toISOString() },
      "csam: retry not yet due — skipping",
    );
    return;
  }

  // Resolve all scannable media on this asset
  const mediaRefs = await resolveMediaRefs(assetId, assetType);

  if (mediaRefs.kind === "no_media") {
    await writeClean(assetId, assetType, null);
    return;
  }

  // video_only with no muxAssetId (e.g. auction external video) — can't sample frames yet
  if (mediaRefs.kind === "video_only" && !mediaRefs.muxAssetId) {
    logger.info({ assetId, assetType }, "csam: non-Mux video-only asset — leaving pending (unsupported in Phase 3a)");
    return;
  }

  // ── Phase 1: Scan still images ─────────────────────────────────────────────

  let imageCleanSummary: unknown = null;

  if (mediaRefs.kind === "images" && mediaRefs.refs.length > 0) {
    type CleanHiveResult = Extract<HiveResult, { outcome: "clean" }>;
    const cleanResults: CleanHiveResult[] = [];
    let hasError = false;

    for (const ref of mediaRefs.refs) {
      const scanUrl = await resolveToScanUrl(ref);

      let hiveResult: HiveResult;
      try {
        hiveResult = await callHive(scanUrl, hiveApiKey);
      } catch (err) {
        logger.error({ err, assetId, assetType, ref }, "csam: Hive call threw (network/timeout) — scheduling retry");
        bumpRetry(retryKey, retry);
        hasError = true;
        break;
      }

      if (hiveResult.outcome === "error") {
        logger.warn({ assetId, assetType, ref, reason: hiveResult.reason }, "csam: Hive returned error — scheduling retry");
        bumpRetry(retryKey, retry);
        hasError = true;
        break;
      }

      if (hiveResult.outcome === "hit") {
        retryState.delete(retryKey);
        await writeBlocked(assetId, assetType, hiveResult);
        return;
      }

      cleanResults.push(hiveResult);
    }

    if (hasError) return;

    imageCleanSummary =
      cleanResults.length === 1
        ? cleanResults[0]!.raw
        : { outcome: "all_images_clean", imageCount: cleanResults.length };
  }

  // ── Phase 2: Scan Mux video frames ────────────────────────────────────────

  const muxAssetId =
    mediaRefs.kind === "video_only"
      ? mediaRefs.muxAssetId
      : mediaRefs.kind === "images"
        ? mediaRefs.muxAssetId
        : null;

  if (muxAssetId) {
    const videoResult = await scanVideoFrames(muxAssetId, assetId, assetType, hiveApiKey);

    if (videoResult.outcome === "error") {
      logger.warn(
        { assetId, assetType, muxAssetId, reason: videoResult.reason },
        "csam: video frame scan error — scheduling retry",
      );
      bumpRetry(retryKey, retry);
      return;
    }

    if (videoResult.outcome === "hit") {
      retryState.delete(retryKey);
      await writeBlocked(assetId, assetType, videoResult.hit);
      return;
    }

    // video frames clean — fall through to write clean below
  }

  // ── All media clean ───────────────────────────────────────────────────────

  retryState.delete(retryKey);

  const rawSummary: unknown =
    imageCleanSummary && muxAssetId
      ? { images: imageCleanSummary, video: "frames_clean" }
      : imageCleanSummary
        ? imageCleanSummary
        : muxAssetId
          ? { outcome: "video_frames_clean" }
          : null;

  await writeClean(assetId, assetType, rawSummary);

  if (assetType === "merch_product") {
    void runMerchOnClean(assetId).catch((err) =>
      logger.error({ err, productId: assetId }, "csam: merch on-clean unhandled rejection"),
    );
  }
}

/**
 * Scan a single image URL through Hive. Used by the live stream sampler.
 * Returns {outcome:"clean"} when scanning is disabled or the API key is absent.
 */
export async function scanFrameUrl(imageUrl: string): Promise<HiveResult> {
  const hiveApiKey = process.env.HIVE_CSAM_API_KEY ?? "";
  if (!CSAM_SCAN_ENABLED || !hiveApiKey) return { outcome: "clean", raw: null };
  return callHive(imageUrl, hiveApiKey);
}

/**
 * Mark a live stream as CSAM-blocked (called by the live sampler on a hit).
 * Delegates to writeBlocked which sets scanStatus, needsNcmecReport, inserts
 * preservation holds, and notifies admins.
 */
export async function blockLiveStream(
  streamId: number,
  hit: { raw: unknown; hashMatch: boolean; csamScore: number },
): Promise<void> {
  await writeBlocked(streamId, "stream_recording", hit);
  // Mark stream ended so it no longer appears live in the browse/feed queries.
  // liveScanner.stopLiveScan is NOT called here to avoid a circular dependency —
  // callers that own the sampler lifecycle (admin.ts, liveScanner.ts) call it themselves.
  await db.update(streamsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(streamsTable.id, streamId));
}

// ── Hive CSAM Detection API ──────────────────────────────────────────────────

async function callHive(imageUrl: string, apiKey: string): Promise<HiveResult> {
  // Hive combined CSAM endpoint — https://docs.thehive.ai/docs/csam-detection
  // Auth: Token header. Input: { url } for URL-based scan. 30 s hard timeout.
  const res = await fetch("https://api.thehive.ai/api/v2/task/sync", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ url: imageUrl }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { outcome: "error", reason: `Hive HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  return parseHiveResponse(await res.json());
}

/**
 * Parse a Hive CSAM API response (shared between URL-based and frame-buffer scans).
 */
function parseHiveResponse(data: any): HiveResult {
  const output = data?.status?.[0]?.response?.output?.[0];
  const classes: any[] = output?.classes ?? [];
  const csamEntry = classes.find((c: any) => c.class === "csam" || c.class === "yes");
  const csamScore: number = csamEntry?.score ?? 0;

  const hashMatch = Boolean(
    output?.pdna?.match ??
    output?.hash_match ??
    data?.status?.[0]?.response?.hash_match ??
    false,
  );

  const isHit = hashMatch || csamScore >= CSAM_BLOCK_THRESHOLD;
  return isHit
    ? { outcome: "hit", raw: data, hashMatch, csamScore }
    : { outcome: "clean", raw: data };
}

// ── Video frame sampling ─────────────────────────────────────────────────────

/**
 * Full video scan pipeline for a Mux asset:
 *   1. Create a short-lived public playback ID (never returned to clients).
 *   2. Extract frames via ffmpeg at the configured sample interval, capped at max_frames.
 *   3. Upload frames to R2 private bucket (temp prefix), scan each via callHive, bulk-delete.
 *   4. Any frame hit → "hit"; all frames clean → "clean"; any error → "error" (retry).
 * The temp public playback ID is always cleaned up in finally.
 */
async function scanVideoFrames(
  muxAssetId: string,
  assetId: number,
  assetType: AssetType,
  hiveApiKey: string,
): Promise<VideoScanResult> {
  let tempPlaybackId: string | null = null;
  const r2TempPrefix = `temp-csam-frames/${assetType}-${assetId}`;

  try {
    // 1. Create a temporary public playback ID for HLS access
    tempPlaybackId = await createTempPublicPlaybackId(muxAssetId);
    const hlsUrl = `https://stream.mux.com/${tempPlaybackId}.m3u8`;

    // 2. Extract frames from the HLS stream
    const frames = await extractVideoFrames(hlsUrl, CSAM_VIDEO_SAMPLE_INTERVAL_SEC, CSAM_VIDEO_MAX_FRAMES);

    if (frames.length === 0) {
      return { outcome: "error", reason: "no frames extracted from video" };
    }

    logger.info(
      { assetId, assetType, muxAssetId, frameCount: frames.length },
      "csam: video frames extracted — uploading to R2 and scanning",
    );

    // 3. Upload all frames to R2 private bucket in parallel
    await Promise.all(
      frames.map((buf, i) =>
        putR2Object("private", `${r2TempPrefix}/frame-${String(i).padStart(4, "0")}.jpg`, buf, "image/jpeg"),
      ),
    );

    // 4. Scan each frame via presigned URL + callHive
    for (let i = 0; i < frames.length; i++) {
      const key = `${r2TempPrefix}/frame-${String(i).padStart(4, "0")}.jpg`;
      const presignedUrl = await getPresignedDownloadUrl(key, 120);

      let result: HiveResult;
      try {
        result = await callHive(presignedUrl, hiveApiKey);
      } catch (err: any) {
        return { outcome: "error", reason: `callHive threw on frame ${i}: ${err?.message ?? String(err)}` };
      }

      if (result.outcome === "error") {
        return { outcome: "error", reason: `Hive error on frame ${i}: ${result.reason}` };
      }

      if (result.outcome === "hit") {
        logger.error(
          { assetId, assetType, muxAssetId, frameIndex: i, hashMatch: result.hashMatch, csamScore: result.csamScore },
          "csam: CSAM HIT in video frame",
        );
        return { outcome: "hit", hit: result };
      }
    }

    logger.info(
      { assetId, assetType, muxAssetId, frameCount: frames.length },
      "csam: all video frames clean",
    );
    return { outcome: "clean" };

  } catch (err: any) {
    return { outcome: "error", reason: err?.message ?? String(err) };
  } finally {
    // Always remove the temporary public playback ID
    if (tempPlaybackId) {
      await deleteAssetPlaybackId(muxAssetId, tempPlaybackId).catch((err) =>
        logger.error(
          { err, muxAssetId, tempPlaybackId },
          "csam: CRITICAL — failed to delete temp public playback ID; requires manual cleanup in Mux dashboard",
        ),
      );
    }
    // Always bulk-delete temp R2 frames (best-effort; private bucket so no security risk if delayed)
    await deleteR2ObjectsByPrefix("private", r2TempPrefix).catch((err) =>
      logger.warn({ err, r2TempPrefix }, "csam: failed to clean up temp R2 frames"),
    );
  }
}

/**
 * Extract JPEG frames from a video URL using ffmpeg.
 *
 * Probes duration first so that if the natural frame count exceeds maxFrames,
 * the effective interval is stretched to distribute frames evenly across the
 * full duration (no section of the video is skipped when capped).
 *
 * Frames are written to a unique /tmp subdirectory and cleaned up on return.
 */
async function extractVideoFrames(
  videoUrl: string,
  intervalSec: number,
  maxFrames: number,
): Promise<Buffer[]> {
  const tmpDir = join(tmpdir(), `csam-frames-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // Probe duration to compute evenly-distributed interval when capped
    const durationSec = await getVideoDurationSec(videoUrl);
    let effectiveInterval = intervalSec;
    if (durationSec !== null && durationSec > 0) {
      const naturalFrames = Math.ceil(durationSec / intervalSec);
      if (naturalFrames > maxFrames) {
        // Stretch interval so maxFrames covers the full video evenly
        effectiveInterval = durationSec / maxFrames;
      }
    }

    const outPattern = join(tmpDir, "frame%04d.jpg");

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-i", videoUrl,
        "-vf", `fps=1/${effectiveInterval.toFixed(3)}`,
        "-vframes", String(maxFrames),
        "-q:v", "5",       // JPEG quality (1=best 31=worst; 5 is compact but detailed enough)
        "-vsync", "vfr",
        outPattern,
      ];

      execFile("ffmpeg", args, { timeout: 180_000 }, (err, _stdout, stderr) => {
        if (err?.code === "ENOENT") {
          reject(new Error("ffmpeg binary not found"));
          return;
        }
        // Non-zero exit is acceptable if frames were produced (e.g. network EOF at end)
        resolve();
      });
    });

    const files = (await readdir(tmpDir)).filter((f) => f.endsWith(".jpg")).sort();
    const frames: Buffer[] = [];
    for (const file of files) {
      frames.push(await readFile(join(tmpDir, file)));
    }
    return frames;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Use ffprobe to get video duration in seconds.
 * Returns null on any error (caller uses configured interval without adjustment).
 */
async function getVideoDurationSec(videoUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        videoUrl,
      ],
      { timeout: 30_000 },
      (_err, stdout) => {
        const d = parseFloat(stdout.trim());
        resolve(isNaN(d) ? null : d);
      },
    );
  });
}

// ── Media reference resolution ────────────────────────────────────────────────

/**
 * Returns ALL scannable media refs on the asset.
 *
 * MediaRefs variants:
 *  images      — still-image refs + optional muxAssetId for a co-located Mux video.
 *  no_media    — nothing to scan → auto-clean.
 *  video_only  — no still images; muxAssetId non-null for Mux (Phase 3a); null for
 *                external/non-Mux video (stays pending — unsupported in this phase).
 *
 * Coverage:
 *  post          → mediaUrl + thumbnailUrl + all mediaItems (deduped).
 *                  muxAssetId carried when present.
 *  dm_message    → mediaUrl.
 *  merch_product → designUrl + previewImageUrl (deduped). Preview-only (no designUrl)
 *                  is scanned, never skipped.
 *  auction       → imageUrl; videoUrl-only → video_only with muxAssetId=null.
 *  avatar/banner → single URL.
 */
async function resolveMediaRefs(assetId: number, assetType: AssetType): Promise<MediaRefs> {
  switch (assetType) {
    case "post": {
      const [row] = await db
        .select({
          mediaUrl: postsTable.mediaUrl,
          thumbnailUrl: postsTable.thumbnailUrl,
          mediaItems: postsTable.mediaItems,
          muxAssetId: postsTable.muxAssetId,
        })
        .from(postsTable)
        .where(eq(postsTable.id, assetId));

      if (!row) return { kind: "no_media" };

      const muxAssetId = row.muxAssetId ?? null;
      const raw: Array<string | null | undefined> = [
        row.mediaUrl,
        row.thumbnailUrl,
        ...(row.mediaItems ?? []),
      ];
      const refs = dedupeRefs(raw);

      if (refs.length > 0) return { kind: "images", refs, muxAssetId };
      if (muxAssetId) return { kind: "video_only", muxAssetId };
      return { kind: "no_media" };
    }

    case "dm_message": {
      const [row] = await db
        .select({ mediaUrl: messagesTable.mediaUrl })
        .from(messagesTable)
        .where(eq(messagesTable.id, assetId));
      const ref = row?.mediaUrl;
      if (!ref) return { kind: "no_media" };
      return { kind: "images", refs: [ref], muxAssetId: null };
    }

    case "merch_product": {
      const [row] = await db
        .select({
          designUrl: merchProductsTable.designUrl,
          previewImageUrl: merchProductsTable.previewImageUrl,
        })
        .from(merchProductsTable)
        .where(eq(merchProductsTable.id, assetId));

      if (!row) return { kind: "no_media" };
      const refs = dedupeRefs([row.designUrl, row.previewImageUrl]);
      if (refs.length === 0) return { kind: "no_media" };
      return { kind: "images", refs, muxAssetId: null };
    }

    case "auction": {
      const [row] = await db
        .select({ imageUrl: auctionsTable.imageUrl, videoUrl: auctionsTable.videoUrl })
        .from(auctionsTable)
        .where(eq(auctionsTable.id, assetId));
      if (!row) return { kind: "no_media" };
      if (row.imageUrl) return { kind: "images", refs: [row.imageUrl], muxAssetId: null };
      if (row.videoUrl) return { kind: "video_only", muxAssetId: null };
      return { kind: "no_media" };
    }

    case "avatar": {
      const [row] = await db
        .select({ avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.id, assetId));
      const ref = row?.avatarUrl;
      if (!ref) return { kind: "no_media" };
      return { kind: "images", refs: [ref], muxAssetId: null };
    }

    case "banner": {
      const [row] = await db
        .select({ bannerUrl: usersTable.bannerUrl })
        .from(usersTable)
        .where(eq(usersTable.id, assetId));
      const ref = row?.bannerUrl;
      if (!ref) return { kind: "no_media" };
      return { kind: "images", refs: [ref], muxAssetId: null };
    }

    case "stream_recording": {
      const [row] = await db
        .select({ muxAssetId: streamsTable.muxAssetId })
        .from(streamsTable)
        .where(eq(streamsTable.id, assetId));
      const muxAssetId = row?.muxAssetId ?? null;
      if (!muxAssetId) return { kind: "no_media" };
      return { kind: "video_only", muxAssetId };
    }

    default:
      return { kind: "no_media" };
  }
}

/** Deduplicate a list of nullable strings, preserving insertion order. */
function dedupeRefs(raw: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r === "string" && r.length > 0 && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/**
 * Convert an R2 key or stored URL into a URL Hive can fetch.
 *
 * - Raw key (no http prefix): presigned private-bucket URL (60 s)
 * - Stored public media URL: pass through
 * - Legacy presigned private-bucket URL: mint a fresh 60-second presigned URL
 * - Unrecognised URL (external / unknown): pass through as-is
 */
async function resolveToScanUrl(keyOrUrl: string): Promise<string> {
  if (!keyOrUrl.startsWith("http")) {
    return getPresignedDownloadUrl(keyOrUrl, 60);
  }
  if (r2KeyFromPublicUrl(keyOrUrl) !== null) {
    return keyOrUrl;
  }
  const privateKey = r2KeyFromStagedUrl(keyOrUrl);
  if (privateKey) {
    return getPresignedDownloadUrl(privateKey, 60);
  }
  return keyOrUrl;
}

// ── Scan status lookup ────────────────────────────────────────────────────────

async function getAssetScanStatus(assetId: number, assetType: AssetType): Promise<string | null> {
  switch (assetType) {
    case "post": {
      const [r] = await db.select({ s: postsTable.scanStatus }).from(postsTable).where(eq(postsTable.id, assetId));
      return r?.s ?? null;
    }
    case "dm_message": {
      const [r] = await db.select({ s: messagesTable.scanStatus }).from(messagesTable).where(eq(messagesTable.id, assetId));
      return r?.s ?? null;
    }
    case "merch_product": {
      const [r] = await db.select({ s: merchProductsTable.scanStatus }).from(merchProductsTable).where(eq(merchProductsTable.id, assetId));
      return r?.s ?? null;
    }
    case "auction": {
      const [r] = await db.select({ s: auctionsTable.scanStatus }).from(auctionsTable).where(eq(auctionsTable.id, assetId));
      return r?.s ?? null;
    }
    case "avatar": {
      const [r] = await db.select({ s: usersTable.avatarScanStatus }).from(usersTable).where(eq(usersTable.id, assetId));
      return r?.s ?? null;
    }
    case "banner": {
      const [r] = await db.select({ s: usersTable.bannerScanStatus }).from(usersTable).where(eq(usersTable.id, assetId));
      return r?.s ?? null;
    }
    case "stream_recording": {
      const [r] = await db.select({ s: streamsTable.scanStatus }).from(streamsTable).where(eq(streamsTable.id, assetId));
      return r?.s ?? null;
    }
    default:
      return null;
  }
}

// ── DB write helpers ──────────────────────────────────────────────────────────

async function writeClean(assetId: number, assetType: AssetType, raw: unknown): Promise<void> {
  const now = new Date();
  const scanResultJson: Record<string, unknown> = { outcome: "clean" };
  if (raw) scanResultJson.raw = raw;

  switch (assetType) {
    case "post":
      await db.update(postsTable).set({ scanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(postsTable.id, assetId));
      break;
    case "dm_message":
      await db.update(messagesTable).set({ scanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(messagesTable.id, assetId));
      break;
    case "merch_product":
      await db.update(merchProductsTable).set({ scanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(merchProductsTable.id, assetId));
      break;
    case "auction":
      await db.update(auctionsTable).set({ scanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(auctionsTable.id, assetId));
      break;
    case "avatar":
      await db.update(usersTable).set({ avatarScanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(usersTable.id, assetId));
      break;
    case "banner":
      await db.update(usersTable).set({ bannerScanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(usersTable.id, assetId));
      break;
    case "stream_recording":
      await db.update(streamsTable).set({ scanStatus: "clean", scanResultJson, scannedAt: now }).where(eq(streamsTable.id, assetId));
      break;
  }
}

async function writeBlocked(
  assetId: number,
  assetType: AssetType,
  hit: { raw: unknown; hashMatch: boolean; csamScore: number },
): Promise<void> {
  const now = new Date();
  const scanResultJson = { outcome: "hit", hashMatch: hit.hashMatch, csamScore: hit.csamScore, raw: hit.raw };

  switch (assetType) {
    case "post":
      await db.update(postsTable)
        .set({ scanStatus: "blocked", scanResultJson, scannedAt: now, needsNcmecReport: true })
        .where(eq(postsTable.id, assetId));
      break;
    case "dm_message":
      await db.update(messagesTable)
        .set({ scanStatus: "blocked", scanResultJson, scannedAt: now, needsNcmecReport: true })
        .where(eq(messagesTable.id, assetId));
      break;
    case "merch_product":
      await db.update(merchProductsTable)
        .set({ scanStatus: "blocked", scanResultJson, scannedAt: now, needsNcmecReport: true })
        .where(eq(merchProductsTable.id, assetId));
      break;
    case "auction":
      await db.update(auctionsTable)
        .set({ scanStatus: "blocked", scanResultJson, scannedAt: now, needsNcmecReport: true })
        .where(eq(auctionsTable.id, assetId));
      break;
    case "avatar":
      await db.update(usersTable)
        .set({ avatarScanStatus: "blocked", needsNcmecReport: true, scanResultJson, scannedAt: now })
        .where(eq(usersTable.id, assetId));
      break;
    case "banner":
      await db.update(usersTable)
        .set({ bannerScanStatus: "blocked", needsNcmecReport: true, scanResultJson, scannedAt: now })
        .where(eq(usersTable.id, assetId));
      break;
    case "stream_recording":
      await db.update(streamsTable)
        .set({ scanStatus: "blocked", needsNcmecReport: true, scanResultJson, scannedAt: now })
        .where(eq(streamsTable.id, assetId));
      break;
  }

  // Register preservation holds for every identifier this asset holds.
  // Best-effort: failure here must not roll back the block status.
  await insertPreservationHolds(assetId, assetType).catch((err) =>
    logger.error(
      { err, assetId, assetType },
      "preservation: failed to insert holds after block — manual intervention required",
    ),
  );

  // Notify all admin users exactly once per block, regardless of asset type.
  // Best-effort: notification failure must not roll back the block status.
  await notifyAdminsOfHit(assetId, assetType, hit.hashMatch, hit.csamScore).catch((err) =>
    logger.error({ err, assetId, assetType }, "csam: admin alert failed after block"),
  );

  // Submit confirmed hit to the Hive Moderation Dashboard (feeds NCMEC Review Feed).
  // Fire-and-forget — MUST NOT affect block, preservation, or holds.
  void submitToDashboard(assetId, assetType).catch((err) =>
    logger.warn({ err, assetId, assetType }, "csam-dashboard: unhandled rejection — dashboard submission skipped"),
  );
}

/**
 * Register preservation holds for all R2 keys and Mux assets belonging to a
 * blocked asset. Idempotent — duplicate holds are silently ignored via the
 * unique index on (identifier_type, identifier_value).
 *
 * Callers: writeBlocked only. Never auto-releases.
 */
async function insertPreservationHolds(assetId: number, assetType: AssetType): Promise<void> {
  const mediaRefs = await resolveMediaRefs(assetId, assetType);
  if (mediaRefs.kind === "no_media") return;

  const holdValues: Array<{
    identifierType: "r2_key" | "mux_asset";
    identifierValue: string;
    assetType: string;
    assetId: number;
    reason: string;
  }> = [];

  if (mediaRefs.kind === "images") {
    for (const ref of mediaRefs.refs) {
      const extracted = r2KeyExtract(ref);
      if (extracted) {
        holdValues.push({
          identifierType: "r2_key",
          identifierValue: extracted.key,
          assetType,
          assetId,
          reason: "csam_block",
        });
      }
    }
  }

  // Both "images" and "video_only" carry muxAssetId
  if (mediaRefs.muxAssetId) {
    holdValues.push({
      identifierType: "mux_asset",
      identifierValue: mediaRefs.muxAssetId,
      assetType,
      assetId,
      reason: "csam_block",
    });
  }

  if (holdValues.length > 0) {
    await db.insert(preservationHoldsTable).values(holdValues).onConflictDoNothing();
    logger.info(
      { assetId, assetType, holdCount: holdValues.length, identifiers: holdValues.map(h => `${h.identifierType}:${h.identifierValue}`) },
      "preservation: holds registered for blocked asset",
    );
  }
}

// ── Admin notification ────────────────────────────────────────────────────────

async function notifyAdminsOfHit(
  assetId: number,
  assetType: AssetType,
  hashMatch: boolean,
  csamScore: number,
): Promise<void> {
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));

    if (admins.length === 0) {
      logger.warn({ assetId, assetType }, "csam: no admin users found to notify of CSAM hit");
      return;
    }

    const message =
      `🚨 CSAM HIT — ${assetType} #${assetId} blocked. ` +
      `hashMatch=${hashMatch} csamScore=${csamScore.toFixed(3)}. ` +
      `NCMEC report flagged. Media preserved in R2 (NOT deleted).`;

    await db.insert(notificationsTable).values(
      admins.map((admin) => ({
        userId: admin.id,
        type: "system_alert" as const,
        message,
        isRead: false,
        actorId: null,
        relatedId: assetId,
      })),
    );

    logger.error(
      { assetId, assetType, hashMatch, csamScore: csamScore.toFixed(3) },
      "csam: CSAM HIT — asset blocked, NCMEC flagged, admin alert sent",
    );
  } catch (err) {
    logger.error({ err, assetId, assetType }, "csam: failed to send admin CSAM alert");
  }
}

// ── Admin-initiated block (human review) ─────────────────────────────────────

/**
 * Block an asset via explicit admin action (human review, not automated CSAM scan).
 * Uses the same preservation + NCMEC flag + admin notification pipeline as an
 * automated Hive hit. Safe to call for any AssetType.
 */
export async function blockByAdmin(assetId: number, assetType: AssetType): Promise<void> {
  await writeBlocked(assetId, assetType, {
    raw: { source: "admin_report_action" },
    hashMatch: false,
    csamScore: 0,
  });
}

/**
 * Notify all admin users of a newly submitted high-priority report.
 * Called immediately by the reports route when reason = underage_csam.
 * Best-effort — failures are logged but never bubble to the caller.
 */
export async function notifyAdminsOfReport(
  reportId: number,
  reason: string,
  contentType: string,
  contentId: string,
): Promise<void> {
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));

    if (admins.length === 0) {
      logger.warn({ reportId, reason }, "csam: no admin users found to notify of report");
      return;
    }

    const message =
      `🚨 High-priority report submitted — ${reason.replace(/_/g, " ")} on ${contentType} #${contentId}. ` +
      `Report #${reportId} awaiting admin review.`;

    await db.insert(notificationsTable).values(
      admins.map((admin) => ({
        userId: admin.id,
        type: "system_alert" as const,
        message,
        isRead: false,
        actorId: null,
        relatedId: reportId,
      })),
    );

    logger.warn({ reportId, reason, contentType, contentId }, "csam: high-priority report alert sent to admins");
  } catch (err) {
    logger.error({ err, reportId, reason }, "csam: failed to send admin report alert");
  }
}

// ── Hive Moderation Dashboard submission ──────────────────────────────────────

/**
 * Submit a confirmed CSAM hit to the Hive Moderation Dashboard so it appears
 * in the NCMEC Review Feed and can be reported to NCMEC by a human moderator.
 *
 * Contract (https://docs.thehive.ai/docs/submit-to-thorn-api):
 *   POST https://api.hivemoderation.com/api/v2/task/sync
 *   Auth: Token <HIVE_DASHBOARD_API_KEY>
 *   Body: { url, thorn_enabled: true, post_id: "<assetType>:<assetId>", user_id: String }
 *
 * Rules:
 *  - Missing HIVE_DASHBOARD_API_KEY → warn + return (never crash).
 *  - Uses a 60-second presigned private URL for image assets.
 *  - For Mux-only video: creates a temp public playback ID, submits, always deletes it.
 *  - Logs ONLY task_id + csam_results booleans — NEVER logs media URLs or raw bodies.
 *  - Any failure is caught and logged; block path is never affected.
 */
async function submitToDashboard(assetId: number, assetType: AssetType): Promise<void> {
  const dashKey = process.env.HIVE_DASHBOARD_API_KEY;
  if (!dashKey) {
    logger.warn({ assetId, assetType }, "csam-dashboard: HIVE_DASHBOARD_API_KEY absent — skipping submission");
    return;
  }

  const offenderUserId = await resolveOffenderUserId(assetId, assetType);
  if (offenderUserId === null) {
    logger.warn({ assetId, assetType }, "csam-dashboard: could not resolve offender userId — skipping submission");
    return;
  }

  // Resolve a short-lived content URL for the dashboard
  const mediaRefs = await resolveMediaRefs(assetId, assetType);

  let contentUrl: string | null = null;
  let tempMuxPlaybackId: string | null = null;
  let tempMuxAssetId: string | null = null;

  if (mediaRefs.kind === "images" && mediaRefs.refs.length > 0) {
    contentUrl = await resolveToScanUrl(mediaRefs.refs[0]!);
  } else if (mediaRefs.kind === "video_only" && mediaRefs.muxAssetId) {
    // For Mux-only recordings, create a short-lived temp playback URL.
    // It is deleted in the finally block below regardless of outcome.
    tempMuxAssetId = mediaRefs.muxAssetId;
    tempMuxPlaybackId = await createTempPublicPlaybackId(mediaRefs.muxAssetId);
    contentUrl = `https://stream.mux.com/${tempMuxPlaybackId}.m3u8`;
  }

  if (!contentUrl) {
    logger.warn({ assetId, assetType }, "csam-dashboard: no content URL resolvable — skipping submission");
    return;
  }

  try {
    const res = await fetch("https://api.hivemoderation.com/api/v2/task/sync", {
      method: "POST",
      headers: {
        Authorization: `Token ${dashKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        url: contentUrl,
        thorn_enabled: true,
        post_id: `${assetType}:${assetId}`,
        user_id: String(offenderUserId),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { assetId, assetType, httpStatus: res.status, responseSnippet: text.slice(0, 200) },
        "csam-dashboard: non-OK response from Hive Moderation Dashboard",
      );
      return;
    }

    const data: any = await res.json().catch(() => null);
    // Log only task_id + csam_results booleans — never log media URLs or raw payload
    const taskId: unknown = data?.id ?? data?.task_id ?? data?.status?.[0]?.task_id;
    const csamResults = extractDashboardCsamBooleans(data);
    logger.info(
      { assetId, assetType, taskId, csamResults },
      "csam-dashboard: confirmed hit submitted to Hive Moderation Dashboard (NCMEC Review Feed)",
    );
  } finally {
    // Always remove the temp Mux playback ID to prevent unintended public access.
    if (tempMuxPlaybackId && tempMuxAssetId) {
      await deleteAssetPlaybackId(tempMuxAssetId, tempMuxPlaybackId).catch((err) =>
        logger.warn(
          { err, muxAssetId: tempMuxAssetId, tempMuxPlaybackId },
          "csam-dashboard: CRITICAL — failed to delete temp Mux playback ID after dashboard submission; manual Mux cleanup required",
        ),
      );
    }
  }
}

/**
 * Resolve the user ID of the content owner (offender) for each asset type.
 * Returns null if the asset record is not found.
 */
async function resolveOffenderUserId(assetId: number, assetType: AssetType): Promise<number | null> {
  switch (assetType) {
    case "post": {
      const [r] = await db.select({ userId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, assetId));
      return r?.userId ?? null;
    }
    case "dm_message": {
      const [r] = await db.select({ userId: messagesTable.senderId }).from(messagesTable).where(eq(messagesTable.id, assetId));
      return r?.userId ?? null;
    }
    case "merch_product": {
      const [r] = await db.select({ userId: merchProductsTable.creatorId }).from(merchProductsTable).where(eq(merchProductsTable.id, assetId));
      return r?.userId ?? null;
    }
    case "auction": {
      const [r] = await db.select({ userId: auctionsTable.sellerId }).from(auctionsTable).where(eq(auctionsTable.id, assetId));
      return r?.userId ?? null;
    }
    case "avatar":
    case "banner":
      // For avatar/banner scans, assetId is the user's own ID
      return assetId;
    case "stream_recording": {
      const [r] = await db.select({ userId: streamsTable.hostId }).from(streamsTable).where(eq(streamsTable.id, assetId));
      return r?.userId ?? null;
    }
    default:
      return null;
  }
}

/**
 * Extract CSAM result booleans from a Hive dashboard response for safe logging.
 * Never returns raw scores or URLs — only class-name → over-threshold boolean pairs.
 */
function extractDashboardCsamBooleans(data: any): Record<string, boolean> | null {
  try {
    const classes: any[] = data?.status?.[0]?.response?.output?.[0]?.classes ?? [];
    if (classes.length === 0) return null;
    const out: Record<string, boolean> = {};
    for (const c of classes) {
      if (typeof c.class === "string" && typeof c.score === "number") {
        out[c.class] = c.score >= 0.5;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

// ── Retry backoff ─────────────────────────────────────────────────────────────

function bumpRetry(key: string, prev: { attempts: number; nextRetryAt: number } | undefined): void {
  const attempts = (prev?.attempts ?? 0) + 1;
  const delayMs = Math.min(60_000 * Math.pow(2, attempts - 1), 10 * 60_000);
  retryState.set(key, { attempts, nextRetryAt: Date.now() + delayMs });
  logger.warn({ key, attempts, delayMinutes: (delayMs / 60_000).toFixed(1) }, "csam: retry scheduled");
}

// ── Merch on-clean handler ────────────────────────────────────────────────────

/**
 * Deferred Printify creation — runs after a merch_product scan_status flips to 'clean'.
 * Idempotent: skips if printifyProductId is already set.
 *
 * Downloads the design image bytes from R2 server-side, converts to base64, and uploads
 * to Printify using their file_name+contents API. Printify stores its own copy.
 * Printify failure leaves printifyProductId null; never corrupts the scan result.
 */
async function runMerchOnClean(productId: number): Promise<void> {
  const [product] = await db
    .select()
    .from(merchProductsTable)
    .where(eq(merchProductsTable.id, productId));

  if (!product) {
    logger.warn({ productId }, "merch-on-clean: product not found");
    return;
  }
  if (product.printifyProductId) {
    logger.info(
      { productId, printifyProductId: product.printifyProductId },
      "merch-on-clean: Printify product already exists — skipping (idempotent)",
    );
    return;
  }
  if (
    !product.designUrl ||
    !product.printifyBlueprintId ||
    !product.printifyPrintProviderId ||
    !product.printifyVariantsJson
  ) {
    logger.warn({ productId }, "merch-on-clean: missing required fields — cannot create Printify product");
    return;
  }

  try {
    const designFetchUrl = await resolveToScanUrl(product.designUrl);
    const downloadRes = await fetch(designFetchUrl, { signal: AbortSignal.timeout(60_000) });
    if (!downloadRes.ok) {
      throw new Error(`Design download failed: HTTP ${downloadRes.status}`);
    }
    const designBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const base64Contents = designBuffer.toString("base64");

    const uploadedImage = await uploadImageFromBytes(base64Contents, `merch-${productId}-design.png`);
    const printifyImageId: string = uploadedImage.id;

    const variants: Array<{ id: number; priceInCents: number; isEnabled: boolean }> = JSON.parse(
      product.printifyVariantsJson,
    );
    const enabled = variants.filter((v) => v.isEnabled);

    const shopId = await getOrCreateShop();

    const created = await createProduct(shopId, {
      title: product.title,
      description: product.description ?? "",
      blueprint_id: product.printifyBlueprintId,
      print_provider_id: product.printifyPrintProviderId,
      variants: enabled.map((v) => ({ id: v.id, price: v.priceInCents, is_enabled: true })),
      print_areas: [
        {
          variant_ids: enabled.map((v) => v.id),
          placeholders: [
            {
              position: "front",
              images: [{ id: printifyImageId, x: 0.5, y: 0.5, scale: 1.0, angle: 0 }],
            },
          ],
        },
      ],
    });

    await publishProduct(shopId, String(created.id));

    await db
      .update(merchProductsTable)
      .set({ printifyProductId: String(created.id), printifyShopId: shopId })
      .where(eq(merchProductsTable.id, productId));

    logger.info(
      { productId, printifyProductId: created.id, shopId },
      "merch-on-clean: Printify product created and published (base64 upload)",
    );
  } catch (err) {
    logger.error(
      { err, productId },
      "merch-on-clean: Printify creation failed — printifyProductId stays null, product non-orderable",
    );
  }
}
