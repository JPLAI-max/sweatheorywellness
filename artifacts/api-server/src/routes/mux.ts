import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { createMuxDirectUpload, getMuxUploadStatus, cancelMuxUpload } from "../lib/mux";
import { db, usersTable, muxPendingUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStorageLimit, getMaxUploadSize } from "../lib/fees";

const router: IRouter = Router();

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(0)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

router.post("/mux/upload-url", requireAuth, async (req, res) => {
  const { fileSize } = req.body as { fileSize?: number };
  if (!fileSize || typeof fileSize !== "number" || fileSize <= 0) {
    return res.status(400).json({ error: "fileSize required" });
  }

  const userId = (req as any).user.id as number;
  const isAdmin = (req as any).user?.isAdmin === true;

  if (!isAdmin) {
    const [user] = await db
      .select({ accountTier: usersTable.accountTier, storageUsedBytes: usersTable.storageUsedBytes })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (user) {
      const tier = user.accountTier ?? "free";
      const maxUpload = getMaxUploadSize(tier);
      if (fileSize > maxUpload) {
        return res.status(400).json({
          error: `File too large for your plan. ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier allows up to ${formatBytes(maxUpload)} per upload.`,
          storageExceeded: true,
          upgradeRequired: tier !== "elite",
        });
      }
      const used = user.storageUsedBytes ?? 0;
      if (used + fileSize > getStorageLimit(tier)) {
        return res.status(400).json({
          error: `Storage limit reached. Upgrade your plan to upload more.`,
          storageExceeded: true,
          upgradeRequired: tier !== "elite",
        });
      }
    }
  }

  let info;
  try {
    info = await createMuxDirectUpload();
  } catch (err: any) {
    const msg: string = err?.message ?? "";
    if (msg.includes("limited to 10 assets") || msg.includes("exceeding this limit")) {
      return res.status(503).json({
        error: "Video upload limit reached on the free Mux plan. Please delete old videos from your Mux dashboard or upgrade your Mux account.",
        storageExceeded: true,
        muxLimitReached: true,
      });
    }
    req.log.error({ err }, "createMuxDirectUpload failed");
    return res.status(503).json({ error: "Video service temporarily unavailable. Please try again." });
  }

  // Track the pending upload so it can be cleaned up if abandoned
  await db.insert(muxPendingUploadsTable).values({
    uploadId: info.uploadId,
    userId,
  });

  return res.json(info);
});

router.get("/mux/upload/:uploadId", requireAuth, async (req, res) => {
  const { uploadId } = req.params as { uploadId: string };
  const status = await getMuxUploadStatus(uploadId);

  // Once the asset is created, persist the assetId so the cleanup job can
  // verify the asset is claimed by a post before deleting it.
  if (status.status === "asset_created" && status.assetId) {
    await db
      .update(muxPendingUploadsTable)
      .set({ muxAssetId: status.assetId })
      .where(eq(muxPendingUploadsTable.uploadId, uploadId));
  }

  return res.json(status);
});

router.delete("/mux/uploads/:uploadId", requireAuth, async (req, res) => {
  const uploadId = req.params.uploadId as string;
  const userId = (req as any).user.id as number;

  const [record] = await db
    .select()
    .from(muxPendingUploadsTable)
    .where(eq(muxPendingUploadsTable.uploadId, uploadId))
    .limit(1);

  if (!record || record.userId !== userId) {
    return res.status(404).json({ error: "Upload not found" });
  }

  try {
    await cancelMuxUpload(uploadId);
  } catch {
    // Best-effort — still clean up our record even if Mux cancel fails
  }

  await db
    .delete(muxPendingUploadsTable)
    .where(eq(muxPendingUploadsTable.uploadId, uploadId));

  req.log.info({ uploadId, userId }, "Mux upload cancelled by user");
  return res.json({ ok: true });
});

export default router;
