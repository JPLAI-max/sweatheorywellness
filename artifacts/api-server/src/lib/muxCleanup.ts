import { db, muxPendingUploadsTable, postsTable, streamsTable, muxCleanupLogTable, usersTable, notificationsTable } from "@workspace/db";
import { lt, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import Mux from "@mux/mux-node";

let _mux: Mux | null = null;

function getMux(): Mux | null {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) return null;
  if (!_mux) {
    _mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
    });
  }
  return _mux;
}

const THRESHOLD_HOURS = Number(process.env.MUX_ORPHAN_THRESHOLD_HOURS ?? "2");
const INTERVAL_MS = Number(process.env.MUX_CLEANUP_INTERVAL_MS ?? String(60 * 60 * 1000));
const ERRORED_SWEEP_INTERVAL_MS = Number(process.env.MUX_ERRORED_SWEEP_INTERVAL_MS ?? String(24 * 60 * 60 * 1000));
const ERROR_ALERT_THRESHOLD = Number(process.env.MUX_ERROR_ALERT_THRESHOLD ?? "5");
const ORPHAN_ALERT_THRESHOLD = Number(process.env.MUX_ORPHAN_ALERT_THRESHOLD ?? "10");
const DELETED_POST_MIN_AGE_HOURS = Number(process.env.MUX_DELETED_POST_SWEEP_MIN_AGE_HOURS ?? String(2 * THRESHOLD_HOURS));

export async function logMuxCleanup(opts: {
  uploadId: string;
  muxAssetId: string | null;
  userId: number | null;
  reason: string;
  durationSeconds?: number | null;
}): Promise<void> {
  try {
    await db.insert(muxCleanupLogTable).values({
      uploadId: opts.uploadId,
      muxAssetId: opts.muxAssetId ?? null,
      userId: opts.userId ?? null,
      reason: opts.reason,
      durationSeconds: opts.durationSeconds ?? null,
    });
  } catch (err) {
    logger.error({ err, uploadId: opts.uploadId }, "Failed to write Mux cleanup log entry");
  }
}

export async function runMuxOrphanCleanup(): Promise<void> {
  const mux = getMux();
  if (!mux) {
    logger.warn("MUX_TOKEN_ID/MUX_TOKEN_SECRET not set — skipping Mux orphan cleanup");
    return;
  }

  const cutoff = new Date(Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000);

  const staleUploads = await db
    .select()
    .from(muxPendingUploadsTable)
    .where(lt(muxPendingUploadsTable.createdAt, cutoff));

  if (staleUploads.length === 0) return;

  logger.info({ count: staleUploads.length, thresholdHours: THRESHOLD_HOURS }, "Mux orphan cleanup: checking stale pending uploads");

  let orphanedUploadCount = 0;
  let orphanedAssetCount = 0;

  for (const record of staleUploads) {
    try {
      if (!record.muxAssetId) {
        // Upload never completed — cancel it on Mux and remove our tracking record
        try {
          await mux.video.uploads.cancel(record.uploadId);
          logger.info({ uploadId: record.uploadId }, "Cancelled orphaned Mux upload");
        } catch (err: any) {
          // 404 means already gone/expired — treat as cleaned up
          if (err?.status !== 404) {
            logger.error({ err, uploadId: record.uploadId }, "Failed to cancel Mux upload");
            continue;
          }
        }
        await logMuxCleanup({
          uploadId: record.uploadId,
          muxAssetId: null,
          userId: record.userId,
          reason: "orphaned_upload",
        });
        orphanedUploadCount++;
      } else {
        // Upload completed and asset was created — check if any post references it
        const [post] = await db
          .select({ id: postsTable.id })
          .from(postsTable)
          .where(eq(postsTable.muxAssetId, record.muxAssetId))
          .limit(1);

        if (post) {
          // Asset is in use — just remove the tracking record
          logger.debug({ muxAssetId: record.muxAssetId, postId: post.id }, "Mux asset is claimed by a post; removing pending record");
        } else {
          // No post matched by muxAssetId — fetch the Mux asset to cross-check
          // its playback IDs against postsTable.muxPlaybackId before deleting.
          // This is a belt-and-suspenders guard: a post could have been saved
          // with muxPlaybackId but a missing/null muxAssetId due to a prior bug.
          let durationSeconds: number | null = null;
          let assetPlaybackIds: string[] = [];
          try {
            const asset = await mux.video.assets.retrieve(record.muxAssetId);
            durationSeconds = asset.duration != null ? Math.round(asset.duration) : null;
            assetPlaybackIds = (asset.playback_ids ?? []).map((p: { id: string }) => p.id).filter(Boolean);
          } catch {
            // Best-effort — don't block deletion if retrieve fails
          }

          if (assetPlaybackIds.length > 0) {
            const [claimedByPlayback] = await db
              .select({ id: postsTable.id, muxPlaybackId: postsTable.muxPlaybackId })
              .from(postsTable)
              .where(inArray(postsTable.muxPlaybackId, assetPlaybackIds))
              .limit(1);

            if (claimedByPlayback) {
              // A post exists that uses this asset's playback ID but is missing
              // muxAssetId — data inconsistency from a prior bug. Skip deletion.
              logger.warn(
                { muxAssetId: record.muxAssetId, postId: claimedByPlayback.id, muxPlaybackId: claimedByPlayback.muxPlaybackId },
                "Mux asset claimed by a post via playback ID (muxAssetId missing on post) — skipping orphan deletion"
              );
              await db
                .delete(muxPendingUploadsTable)
                .where(eq(muxPendingUploadsTable.id, record.id));
              continue;
            }
          }

          try {
            await mux.video.assets.delete(record.muxAssetId);
            logger.info({ muxAssetId: record.muxAssetId, uploadId: record.uploadId }, "Deleted orphaned Mux asset");
          } catch (err: any) {
            if (err?.status !== 404) {
              logger.error({ err, muxAssetId: record.muxAssetId }, "Failed to delete orphaned Mux asset");
              continue;
            }
          }
          await logMuxCleanup({
            uploadId: record.uploadId,
            muxAssetId: record.muxAssetId,
            userId: record.userId,
            reason: "orphaned_asset",
            durationSeconds,
          });
          orphanedAssetCount++;
        }
      }

      await db
        .delete(muxPendingUploadsTable)
        .where(eq(muxPendingUploadsTable.id, record.id));
    } catch (err) {
      logger.error({ err, uploadId: record.uploadId }, "Unexpected error during Mux orphan cleanup iteration");
    }
  }

  const totalOrphaned = orphanedUploadCount + orphanedAssetCount;
  if (totalOrphaned > ORPHAN_ALERT_THRESHOLD) {
    await notifyAdminsOfMuxOrphanSpike(orphanedUploadCount, orphanedAssetCount);
  }

  logger.info({ orphanedUploads: orphanedUploadCount, orphanedAssets: orphanedAssetCount }, "Mux orphan cleanup: complete");
}

// ── Admin notification helper ────────────────────────────────────────────────

async function notifyAdmins(message: string, logLabel: string, logMeta: Record<string, unknown>): Promise<void> {
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));

    if (admins.length === 0) {
      logger.warn(`${logLabel}: no admin users found to notify`);
      return;
    }

    await db.insert(notificationsTable).values(
      admins.map(admin => ({
        userId: admin.id,
        type: "system_alert",
        message,
        isRead: false,
        actorId: null,
        relatedId: null,
      })),
    );

    logger.warn({ ...logMeta, adminCount: admins.length }, `${logLabel}: notified admins`);
  } catch (err) {
    logger.error({ err }, `${logLabel}: failed to insert admin notifications`);
  }
}

// ── Daily errored-asset & errored-upload sweep ─────────────────────────────
// Queries the Mux API directly for errored assets and errored/expired uploads
// that may have slipped through webhook delivery, and cleans them up.

async function notifyAdminsOfMuxErrorSpike(deletedAssets: number, deletedUploads: number, deletedPostAssets: number): Promise<void> {
  const total = deletedAssets + deletedUploads + deletedPostAssets;
  const parts = [
    `${deletedAssets} errored asset(s)`,
    `${deletedUploads} errored upload(s)`,
    `${deletedPostAssets} deleted-post asset(s)`,
  ];
  const message =
    `Mux cleanup alert: ${total} item(s) removed in the latest sweep ` +
    `(${parts.join(", ")}) — ` +
    `exceeds threshold of ${ERROR_ALERT_THRESHOLD}. Check the admin cleanup log for details.`;
  await notifyAdmins(message, "Mux error spike alert", {
    total,
    deletedAssets,
    deletedUploads,
    deletedPostAssets,
    threshold: ERROR_ALERT_THRESHOLD,
  });
}

async function notifyAdminsOfMuxOrphanSpike(orphanedUploads: number, orphanedAssets: number): Promise<void> {
  const total = orphanedUploads + orphanedAssets;
  const message =
    `Mux orphan cleanup alert: ${total} orphaned item(s) removed in the latest sweep ` +
    `(${orphanedUploads} upload(s), ${orphanedAssets} asset(s)) — ` +
    `exceeds threshold of ${ORPHAN_ALERT_THRESHOLD}. Check the admin cleanup log for details.`;
  await notifyAdmins(message, "Mux orphan spike alert", {
    total,
    orphanedUploads,
    orphanedAssets,
    threshold: ORPHAN_ALERT_THRESHOLD,
  });
}

// ── Daily deleted-post ready-asset sweep ────────────────────────────────────
// Catches `ready` Mux assets that have no corresponding post in the database
// (e.g. the immediate deletion call failed when the post was deleted).
// A minimum-age gate prevents accidentally removing assets that are still
// mid-publish (asset created but post record not yet written).

export async function runMuxDeletedPostAssetSweep(): Promise<number> {
  const mux = getMux();
  if (!mux) return 0;

  const minAgeMs = DELETED_POST_MIN_AGE_HOURS * 60 * 60 * 1000;
  const cutoffMs = Date.now() - minAgeMs;

  logger.info({ minAgeHours: DELETED_POST_MIN_AGE_HOURS }, "Mux deleted-post asset sweep: starting");

  let deletedCount = 0;

  try {
    // Collect all ready assets from Mux (paginated)
    const readyAssets: Array<{ id: string; createdAt: string | null; duration?: number | null }> = [];
    let page = 1;
    while (true) {
      const response = await mux.video.assets.list({ status: "ready", page, limit: 100 } as any);
      const items = Array.isArray(response) ? response : (response as any)?.data ?? [];
      if (items.length === 0) break;
      for (const asset of items) {
        if (asset.id) {
          readyAssets.push({ id: asset.id, createdAt: asset.created_at ?? null, duration: asset.duration ?? null });
        }
      }
      if (items.length < 100) break;
      page++;
    }

    if (readyAssets.length === 0) {
      logger.info("Mux deleted-post asset sweep: no ready assets found");
      return 0;
    }

    // Apply minimum-age gate — only include assets whose creation timestamp
    // is parseable AND older than the cutoff. Assets with a missing or
    // unparseable timestamp are skipped (safe-by-default: unknown age ≠ old).
    // The Mux SDK encodes created_at as a Unix-epoch-seconds string, e.g. "1716992021".
    const agedAssets = readyAssets.filter(a => {
      if (!a.createdAt) {
        logger.debug({ muxAssetId: a.id }, "Mux deleted-post asset sweep: skipping asset with no created_at");
        return false;
      }
      const createdMs = Number(a.createdAt) * 1000;
      if (!Number.isFinite(createdMs) || createdMs <= 0) {
        logger.debug({ muxAssetId: a.id, createdAt: a.createdAt }, "Mux deleted-post asset sweep: skipping asset with unparseable created_at");
        return false;
      }
      return createdMs < cutoffMs;
    });

    if (agedAssets.length === 0) {
      logger.info("Mux deleted-post asset sweep: all ready assets are too recent or have unknown age, skipping");
      return 0;
    }

    // Find which asset IDs are still referenced by a post or a stream VOD recording
    const assetIds = agedAssets.map(a => a.id);
    const [claimedPosts, claimedStreams] = assetIds.length > 0
      ? await Promise.all([
          db
            .select({ muxAssetId: postsTable.muxAssetId })
            .from(postsTable)
            .where(inArray(postsTable.muxAssetId, assetIds)),
          db
            .select({ muxAssetId: streamsTable.muxAssetId })
            .from(streamsTable)
            .where(inArray(streamsTable.muxAssetId, assetIds)),
        ])
      : [[], []];
    const claimedByPostIds = new Set(claimedPosts.map(p => p.muxAssetId).filter(Boolean));
    const claimedByStreamIds = new Set(claimedStreams.map(s => s.muxAssetId).filter(Boolean));
    const claimedIds = new Set([...claimedByPostIds, ...claimedByStreamIds]);

    // Log assets that are being skipped because they belong to a stream VOD
    const streamVodSkippedAssets = agedAssets.filter(
      a => claimedByStreamIds.has(a.id) && !claimedByPostIds.has(a.id),
    );
    if (streamVodSkippedAssets.length > 0) {
      logger.info(
        { count: streamVodSkippedAssets.length, assetIds: streamVodSkippedAssets.map(a => a.id) },
        "Mux deleted-post asset sweep: skipping assets claimed by stream VODs",
      );
      for (const asset of streamVodSkippedAssets) {
        const durationSeconds = asset.duration != null ? Math.round(asset.duration) : null;
        await logMuxCleanup({
          uploadId: asset.id,
          muxAssetId: asset.id,
          userId: null,
          reason: "stream_vod_sweep_skip",
          durationSeconds,
        });
      }
    }

    const orphanedAssets = agedAssets.filter(a => !claimedIds.has(a.id));

    if (orphanedAssets.length === 0) {
      logger.info("Mux deleted-post asset sweep: no orphaned ready assets found");
      return 0;
    }

    logger.info({ count: orphanedAssets.length }, "Mux deleted-post asset sweep: found orphaned ready assets");

    for (const asset of orphanedAssets) {
      let deleted = false;
      try {
        await mux.video.assets.delete(asset.id);
        deleted = true;
        logger.info({ muxAssetId: asset.id }, "Mux deleted-post asset sweep: deleted orphaned ready asset");
      } catch (err: any) {
        if (err?.status === 404) {
          deleted = true;
        } else {
          logger.error({ err, muxAssetId: asset.id }, "Mux deleted-post asset sweep: failed to delete asset");
        }
      }

      if (deleted) {
        deletedCount++;
        const durationSeconds = asset.duration != null ? Math.round(asset.duration) : null;
        await logMuxCleanup({
          uploadId: asset.id,
          muxAssetId: asset.id,
          userId: null,
          reason: "deleted_post_daily_sweep",
          durationSeconds,
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Mux deleted-post asset sweep: failed");
  }

  logger.info({ deletedCount }, "Mux deleted-post asset sweep: complete");
  return deletedCount;
}

export async function runMuxErroredAssetSweep(): Promise<void> {
  const mux = getMux();
  if (!mux) {
    logger.warn("MUX_TOKEN_ID/MUX_TOKEN_SECRET not set — skipping Mux errored asset sweep");
    return;
  }

  logger.info("Mux errored asset sweep: starting");

  let deletedAssetCount = 0;
  let deletedUploadCount = 0;

  // ── 1. Sweep errored assets ──────────────────────────────────────────────
  try {
    // Collect all errored assets from Mux (paginate if needed)
    const erroredAssets: Array<{ id: string; duration?: number | null }> = [];
    let page = 1;
    while (true) {
      const response = await mux.video.assets.list({ status: "errored", page, limit: 100 } as any);
      const items = Array.isArray(response) ? response : (response as any)?.data ?? [];
      if (items.length === 0) break;
      for (const asset of items) {
        if (asset.id) erroredAssets.push({ id: asset.id, duration: asset.duration });
      }
      if (items.length < 100) break;
      page++;
    }

    if (erroredAssets.length > 0) {
      logger.info({ count: erroredAssets.length }, "Mux errored asset sweep: found errored assets");

      // Filter out any assets that are referenced by a post
      const assetIds = erroredAssets.map(a => a.id);
      const claimedPosts = assetIds.length > 0
        ? await db
            .select({ muxAssetId: postsTable.muxAssetId })
            .from(postsTable)
            .where(inArray(postsTable.muxAssetId, assetIds))
        : [];
      const claimedIds = new Set(claimedPosts.map(p => p.muxAssetId).filter(Boolean));

      for (const asset of erroredAssets) {
        if (claimedIds.has(asset.id)) {
          logger.debug({ muxAssetId: asset.id }, "Mux errored asset sweep: asset claimed by a post, skipping");
          continue;
        }

        // Look up a pending-uploads record for logging context
        const [record] = await db
          .select()
          .from(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.muxAssetId, asset.id))
          .limit(1);

        let deleted = false;
        try {
          await mux.video.assets.delete(asset.id);
          deleted = true;
          logger.info({ muxAssetId: asset.id }, "Mux errored asset sweep: deleted errored asset");
        } catch (err: any) {
          if (err?.status === 404) {
            deleted = true;
          } else {
            logger.error({ err, muxAssetId: asset.id }, "Mux errored asset sweep: failed to delete asset");
          }
        }

        if (deleted) {
          deletedAssetCount++;
          // Remove the pending-uploads tracking row if present
          if (record) {
            await db
              .delete(muxPendingUploadsTable)
              .where(eq(muxPendingUploadsTable.id, record.id));
          }
          const durationSeconds = asset.duration != null ? Math.round(asset.duration) : null;
          await logMuxCleanup({
            uploadId: record?.uploadId ?? asset.id,
            muxAssetId: asset.id,
            userId: record?.userId ?? null,
            reason: "errored_asset_daily_sweep",
            durationSeconds,
          });
        }
      }
    } else {
      logger.info("Mux errored asset sweep: no errored assets found");
    }
  } catch (err) {
    logger.error({ err }, "Mux errored asset sweep: failed to list errored assets");
  }

  // ── 2. Sweep errored/expired uploads ────────────────────────────────────
  try {
    const staleStatuses = new Set(["errored", "timed_out"]);
    const staleUploads: Array<{ id: string }> = [];
    let page = 1;
    while (true) {
      const response = await mux.video.uploads.list({ page, limit: 100 } as any);
      const items = Array.isArray(response) ? response : (response as any)?.data ?? [];
      if (items.length === 0) break;
      for (const upload of items) {
        if (upload.id && staleStatuses.has(upload.status)) {
          staleUploads.push({ id: upload.id });
        }
      }
      if (items.length < 100) break;
      page++;
    }

    if (staleUploads.length > 0) {
      logger.info({ count: staleUploads.length }, "Mux errored upload sweep: found errored/expired uploads");

      for (const upload of staleUploads) {
        const [record] = await db
          .select()
          .from(muxPendingUploadsTable)
          .where(eq(muxPendingUploadsTable.uploadId, upload.id))
          .limit(1);

        try {
          await mux.video.uploads.cancel(upload.id);
          logger.info({ uploadId: upload.id }, "Mux errored upload sweep: cancelled errored/expired upload");
        } catch (err: any) {
          if (err?.status !== 404) {
            logger.error({ err, uploadId: upload.id }, "Mux errored upload sweep: failed to cancel upload");
            continue;
          }
        }

        deletedUploadCount++;

        if (record) {
          await db
            .delete(muxPendingUploadsTable)
            .where(eq(muxPendingUploadsTable.id, record.id));
        }

        await logMuxCleanup({
          uploadId: upload.id,
          muxAssetId: null,
          userId: record?.userId ?? null,
          reason: "errored_upload_daily_sweep",
        });
      }
    } else {
      logger.info("Mux errored upload sweep: no errored/expired uploads found");
    }
  } catch (err) {
    logger.error({ err }, "Mux errored upload sweep: failed to list uploads");
  }

  // ── 3. Sweep ready assets whose posts were deleted ───────────────────────
  const deletedPostAssetCount = await runMuxDeletedPostAssetSweep();

  // ── 4. Alert admins if combined deletion count exceeds threshold ──────────
  const totalDeleted = deletedAssetCount + deletedUploadCount + deletedPostAssetCount;
  if (totalDeleted > ERROR_ALERT_THRESHOLD) {
    await notifyAdminsOfMuxErrorSpike(deletedAssetCount, deletedUploadCount, deletedPostAssetCount);
  }

  logger.info({ deletedAssets: deletedAssetCount, deletedUploads: deletedUploadCount }, "Mux errored asset sweep: complete");
}

let _timer: ReturnType<typeof setInterval> | null = null;
let _erroredTimer: ReturnType<typeof setInterval> | null = null;

export function startMuxOrphanCleanupScheduler(): void {
  if (_timer) return;
  _timer = setInterval(() => {
    runMuxOrphanCleanup().catch(err =>
      logger.error({ err }, "Mux orphan cleanup scheduler error"),
    );
  }, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS, thresholdHours: THRESHOLD_HOURS }, "Mux orphan cleanup scheduler started");
}

export function startMuxErroredAssetSweepScheduler(): void {
  if (_erroredTimer) return;
  _erroredTimer = setInterval(() => {
    runMuxErroredAssetSweep().catch(err =>
      logger.error({ err }, "Mux errored asset sweep scheduler error"),
    );
  }, ERRORED_SWEEP_INTERVAL_MS);
  logger.info({ intervalMs: ERRORED_SWEEP_INTERVAL_MS }, "Mux errored asset sweep scheduler started");
}
