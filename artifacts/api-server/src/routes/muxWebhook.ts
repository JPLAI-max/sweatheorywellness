import { Router, type IRouter } from "express";
import Mux from "@mux/mux-node";
import { db, muxPendingUploadsTable, postsTable, streamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logMuxCleanup } from "../lib/muxCleanup";
import { scanAsset } from "../lib/csam";

const router: IRouter = Router();

function getMux(): Mux | null {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) return null;
  return new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
  });
}

router.post("/mux/webhook", async (req, res) => {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) {
    // If no secret is configured, reject the request rather than process
    // unauthenticated payloads.
    res.status(503).json({ error: "Mux webhook not configured" });
    return;
  }

  const mux = getMux();
  if (!mux) {
    res.status(503).json({ error: "Mux credentials not configured" });
    return;
  }

  // req.body is a raw Buffer here (express.raw registered in app.ts for this path)
  const rawBody: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body));

  try {
    mux.webhooks.verifySignature(rawBody.toString("utf8"), req.headers as Record<string, string>, secret);
  } catch (err) {
    logger.warn({ err }, "Mux webhook signature verification failed");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const eventType: string = payload?.type ?? "";
  const data = payload?.data ?? {};

  logger.info({ eventType }, "Received Mux webhook");

  try {
    if (eventType === "video.upload.cancelled") {
      // The upload was explicitly cancelled (e.g. by our cleanup job or the user).
      // If an asset was already created from this upload, delete it from Mux if
      // no post claims it.
      const uploadId: string = data?.id ?? "";
      if (uploadId) {
        const [record] = await db
          .select()
          .from(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.uploadId, uploadId))
          .limit(1);

        if (record?.muxAssetId) {
          const [post] = await db
            .select({ id: postsTable.id })
            .from(postsTable)
            .where(eq(postsTable.muxAssetId, record.muxAssetId))
            .limit(1);

          if (!post) {
            let durationSeconds: number | null = null;
            try {
              const asset = await mux.video.assets.retrieve(record.muxAssetId);
              durationSeconds = asset.duration != null ? Math.round(asset.duration) : null;
            } catch {
              // Best-effort — don't block deletion if retrieve fails
            }
            let deleted = false;
            try {
              await mux.video.assets.delete(record.muxAssetId);
              deleted = true;
              logger.info({ muxAssetId: record.muxAssetId, uploadId }, "Deleted orphaned Mux asset via upload.cancelled webhook");
            } catch (err: any) {
              if (err?.status === 404) {
                // Already gone — still counts as cleaned up
                deleted = true;
              } else {
                logger.error({ err, muxAssetId: record.muxAssetId }, "Failed to delete Mux asset via webhook");
              }
            }
            if (deleted) {
              await logMuxCleanup({
                uploadId,
                muxAssetId: record.muxAssetId,
                userId: record.userId,
                reason: "orphaned_asset_webhook",
                durationSeconds,
              });
            }
          }
        }

        await db
          .delete(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.uploadId, uploadId));
      }
    } else if (eventType === "video.asset.errored") {
      // The asset encountered an unrecoverable error. Delete it from Mux and
      // clean up our tracking record.
      const assetId: string = data?.id ?? "";
      if (assetId) {
        // Look up the pending-uploads record to get uploadId and userId for logging
        const [record] = await db
          .select()
          .from(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.muxAssetId, assetId))
          .limit(1);

        // Remove our tracking record first
        await db
          .delete(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.muxAssetId, assetId));

        // Delete the errored asset from Mux (404 means already gone)
        let deleted = false;
        try {
          await mux.video.assets.delete(assetId);
          deleted = true;
          logger.info({ muxAssetId: assetId }, "Deleted errored Mux asset via webhook");
        } catch (err: any) {
          if (err?.status === 404) {
            deleted = true;
          } else {
            logger.error({ err, muxAssetId: assetId }, "Failed to delete errored Mux asset via webhook");
          }
        }

        if (deleted) {
          await logMuxCleanup({
            uploadId: record?.uploadId ?? assetId,
            muxAssetId: assetId,
            userId: record?.userId ?? null,
            reason: "errored_asset_webhook",
          });
        }
      }
    } else if (eventType === "video.upload.errored") {
      // The upload itself errored. Cancel/delete the upload object, clean up any
      // unclaimed asset it may have already produced, and remove our tracking row.
      const uploadId: string = data?.id ?? "";
      if (uploadId) {
        const [record] = await db
          .select()
          .from(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.uploadId, uploadId))
          .limit(1);

        let cleanedAssetId: string | null = null;

        // If an asset was already created from this upload, delete it if unclaimed
        if (record?.muxAssetId) {
          const [post] = await db
            .select({ id: postsTable.id })
            .from(postsTable)
            .where(eq(postsTable.muxAssetId, record.muxAssetId))
            .limit(1);

          if (!post) {
            let deleted = false;
            try {
              await mux.video.assets.delete(record.muxAssetId);
              deleted = true;
              logger.info({ muxAssetId: record.muxAssetId, uploadId }, "Deleted asset from errored upload via webhook");
            } catch (err: any) {
              if (err?.status === 404) {
                deleted = true;
              } else {
                logger.error({ err, muxAssetId: record.muxAssetId }, "Failed to delete asset from errored upload via webhook");
              }
            }
            if (deleted) cleanedAssetId = record.muxAssetId;
          }
        }

        // Always attempt to cancel the upload object on Mux
        try {
          await mux.video.uploads.cancel(uploadId);
          logger.info({ uploadId }, "Cancelled errored Mux upload via webhook");
        } catch (err: any) {
          if (err?.status !== 404) {
            logger.error({ err, uploadId }, "Failed to cancel errored Mux upload via webhook");
          }
        }

        // Remove the DB tracking row
        await db
          .delete(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.uploadId, uploadId));

        // Log the cleanup action
        await logMuxCleanup({
          uploadId,
          muxAssetId: cleanedAssetId,
          userId: record?.userId ?? null,
          reason: "errored_upload_webhook",
        });
      }
    } else if (eventType === "video.upload.asset_created") {
      // Mux has finished ingesting the upload and created an asset. Record the
      // assetId so the cleanup job knows whether it is claimed later on.
      const uploadId: string = data?.id ?? "";
      const assetId: string = data?.asset_id ?? "";
      if (uploadId && assetId) {
        await db
          .update(muxPendingUploadsTable)
          .set({ muxAssetId: assetId })
          .where(eq(muxPendingUploadsTable.uploadId, uploadId));
        logger.debug({ uploadId, muxAssetId: assetId }, "Updated pending upload record with Mux asset ID");
      }
    } else if (eventType === "video.asset.ready") {
      // Phase 3b-A: when a live-stream recording asset becomes ready, register it
      // in the scan pipeline (scan_status='pending') and kick off 3a frame-sampling.
      // We identify recording assets by the presence of data.live_stream_id.
      // Direct-upload assets are handled via video.upload.asset_created + posts route.
      const liveStreamId: string = data?.live_stream_id ?? "";
      const assetId: string = data?.id ?? "";
      if (liveStreamId && assetId) {
        const [stream] = await db
          .select({ id: streamsTable.id })
          .from(streamsTable)
          .where(eq(streamsTable.muxLiveStreamId, liveStreamId))
          .limit(1);

        if (stream) {
          await db
            .update(streamsTable)
            .set({ muxAssetId: assetId, scanStatus: "pending" })
            .where(eq(streamsTable.id, stream.id));

          logger.info(
            { streamId: stream.id, muxAssetId: assetId, muxLiveStreamId: liveStreamId },
            "csam: live-stream recording ready — registered as pending, queuing frame scan",
          );

          // Fire-and-forget — same pattern as uploaded video in posts route
          scanAsset(stream.id, "stream_recording").catch((err) =>
            logger.error(
              { err, streamId: stream.id, muxAssetId: assetId },
              "csam: stream_recording scanAsset unhandled rejection",
            ),
          );
        } else {
          logger.warn(
            { muxLiveStreamId: liveStreamId, muxAssetId: assetId },
            "csam: video.asset.ready for live recording but no matching stream row — ignoring",
          );
        }
      }
    }
  } catch (err) {
    logger.error({ err, eventType }, "Error handling Mux webhook event");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  res.json({ ok: true });
});

export default router;
