import Mux from "@mux/mux-node";
import jwt from "jsonwebtoken";
import { logger } from "./logger";
import { db, preservationHoldsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let _mux: Mux | null = null;

function getMux(): Mux {
  if (!_mux) {
    if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
      throw new Error("MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set");
    }
    _mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
    });
  }
  return _mux;
}

export const RTMP_BASE_URL = "rtmps://global-live.mux.com:443/app";

export interface MuxStreamCredentials {
  muxLiveStreamId: string;
  muxPlaybackId: string;
  muxStreamKey: string;
  rtmpUrl: string;
  streamKey: string;
}

export async function createMuxLiveStream(): Promise<MuxStreamCredentials> {
  const mux = getMux();
  const liveStream = await mux.video.liveStreams.create({
    // Signed policy — viewers must present a server-minted JWT to play.
    // Phase 3b-B2: live playback is no longer public at the CDN level.
    playback_policy: ["signed"],
    // Recording asset uses SIGNED policy — identical to direct-upload assets.
    // The recording VOD is not served until scan_status='clean' (Phase 3b-A).
    new_asset_settings: { playback_policy: ["signed"] },
    latency_mode: "reduced",
    reconnect_window: 60,
  });

  const playbackId = liveStream.playback_ids?.[0]?.id ?? "";
  const streamKey = liveStream.stream_key ?? "";

  logger.info({ muxLiveStreamId: liveStream.id }, "Created Mux live stream");

  return {
    muxLiveStreamId: liveStream.id,
    muxPlaybackId: playbackId,
    muxStreamKey: streamKey,
    rtmpUrl: RTMP_BASE_URL,
    streamKey,
  };
}

export async function completeMuxLiveStream(muxLiveStreamId: string): Promise<void> {
  try {
    const mux = getMux();
    await mux.video.liveStreams.complete(muxLiveStreamId);
    logger.info({ muxLiveStreamId }, "Completed Mux live stream");
  } catch (err) {
    logger.error({ err, muxLiveStreamId }, "Failed to complete Mux live stream");
  }
}

export async function deleteMuxLiveStream(muxLiveStreamId: string): Promise<void> {
  try {
    const mux = getMux();
    await mux.video.liveStreams.delete(muxLiveStreamId);
    logger.info({ muxLiveStreamId }, "Deleted Mux live stream");
  } catch (err) {
    logger.error({ err, muxLiveStreamId }, "Failed to delete Mux live stream");
  }
}

// ─── Video Upload ─────────────────────────────────────────────────────────────

export interface MuxUploadInfo {
  uploadId: string;
  uploadUrl: string;
}

export async function createMuxDirectUpload(): Promise<MuxUploadInfo> {
  const mux = getMux();
  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      // Public playback — videos are playable immediately via MuxPlayer.
      // CSAM gating is handled by the approve-then-remove scanner: posts are
      // visible right away and removed only if the scanner flags them as blocked.
      playback_policy: ["public"],
      encoding_tier: "smart",
    },
    cors_origin: "*",
  });
  return { uploadId: upload.id, uploadUrl: upload.url! };
}

export interface MuxUploadStatus {
  status: "waiting" | "asset_created" | "errored" | "cancelled";
  assetId?: string;
  playbackId?: string;
}

export async function getMuxUploadStatus(uploadId: string): Promise<MuxUploadStatus> {
  const mux = getMux();
  const upload = await mux.video.uploads.retrieve(uploadId);
  if (!upload.asset_id) {
    return { status: (upload.status as MuxUploadStatus["status"]) ?? "waiting" };
  }
  const asset = await mux.video.assets.retrieve(upload.asset_id);
  const playbackId = asset.playback_ids?.[0]?.id;
  return {
    status: "asset_created",
    assetId: upload.asset_id,
    playbackId,
  };
}

export async function deleteMuxAsset(muxAssetId: string): Promise<void> {
  // Preservation hold check — fail-closed: if we cannot verify the hold status,
  // do NOT delete. The asset must survive over any temporary DB outage.
  try {
    const [hold] = await db
      .select({ id: preservationHoldsTable.id })
      .from(preservationHoldsTable)
      .where(and(
        eq(preservationHoldsTable.identifierType, "mux_asset"),
        eq(preservationHoldsTable.identifierValue, muxAssetId),
        eq(preservationHoldsTable.released, false),
      ))
      .limit(1);
    if (hold) {
      logger.warn({ muxAssetId }, "preservation: Mux asset NOT deleted — active hold (CSAM/NCMEC preservation)");
      return;
    }
  } catch (holdErr) {
    logger.error({ holdErr, muxAssetId }, "preservation: hold check failed — skipping delete (fail-closed)");
    return;
  }

  try {
    const mux = getMux();
    await mux.video.assets.delete(muxAssetId);
    logger.info({ muxAssetId }, "Deleted Mux asset");
  } catch (err) {
    logger.error({ err, muxAssetId }, "Failed to delete Mux asset");
  }
}

/**
 * Create a temporary PUBLIC playback ID on a signed Mux asset.
 * Used server-side only for CSAM frame sampling — never returned to clients.
 * ALWAYS pair with deleteAssetPlaybackId in a finally block.
 */
export async function createTempPublicPlaybackId(muxAssetId: string): Promise<string> {
  const mux = getMux();
  const pb = await mux.video.assets.createPlaybackId(muxAssetId, { policy: "public" });
  if (!pb.id) throw new Error(`Mux returned no playback ID for asset ${muxAssetId}`);
  logger.info({ muxAssetId, playbackId: pb.id }, "mux: created temp public playback ID for CSAM scan");
  return pb.id;
}

/**
 * Delete a playback ID from a Mux asset. Call this after CSAM frame scanning
 * to remove the temporary public playback ID created by createTempPublicPlaybackId.
 */
export async function deleteAssetPlaybackId(muxAssetId: string, playbackId: string): Promise<void> {
  const mux = getMux();
  await mux.video.assets.deletePlaybackId(muxAssetId, playbackId);
  logger.info({ muxAssetId, playbackId }, "mux: deleted temp public playback ID");
}

/**
 * Mint a short-lived Mux signed playback JWT (RS256).
 *
 * Requires:
 *   MUX_SIGNING_KEY_ID     — the key ID shown in the Mux dashboard
 *   MUX_SIGNING_PRIVATE_KEY — base64-encoded PKCS-8 RSA private key
 *
 * type codes: 'v' = video, 't' = thumbnail, 'g' = GIF, 's' = storyboard.
 * Throws if either env var is missing.
 */
export function mintMuxJwt(
  playbackId: string,
  type: "v" | "t" | "g" | "s",
  ttlSeconds: number,
): string {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const privateKeyBase64 = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!keyId || !privateKeyBase64) {
    throw new Error("MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY not configured");
  }
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  // Mux signed playback requires `kid` in the JWT *header*, not the payload.
  // jsonwebtoken's `keyid` option sets the header `kid` field (RFC 7515 §4.1.4).
  return jwt.sign(
    {
      sub: playbackId,
      aud: type,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    },
    privateKey,
    { algorithm: "RS256", keyid: keyId, noTimestamp: true },
  );
}

/**
 * Retrieve the first playback ID from a Mux asset.
 * Used by the recording token endpoint to get the VOD playback ID from muxAssetId.
 */
export async function getMuxAssetPlaybackId(muxAssetId: string): Promise<string> {
  const mux = getMux();
  const asset = await mux.video.assets.retrieve(muxAssetId);
  const playbackId = asset.playback_ids?.[0]?.id;
  if (!playbackId) throw new Error(`No playback ID found for Mux asset ${muxAssetId}`);
  return playbackId;
}

export async function cancelMuxUpload(uploadId: string): Promise<void> {
  try {
    const mux = getMux();
    await mux.video.uploads.cancel(uploadId);
    logger.info({ uploadId }, "Cancelled Mux upload");
  } catch (err: any) {
    if (err?.status !== 404) {
      logger.error({ err, uploadId }, "Failed to cancel Mux upload");
      throw err;
    }
  }
}
