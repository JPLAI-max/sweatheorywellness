import { Router, type IRouter } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { requireAuth } from "../middlewares/auth";
import { getPresignedDownloadUrl, putR2Object } from "../lib/r2";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getStorageLimit, getMaxUploadSize } from "../lib/fees";
import { logIpEvent } from "../lib/ipEvents";

const router: IRouter = Router();

const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/gif":  "gif",
  "image/webp": "webp",
  "video/mp4":      "mp4",
  "video/quicktime": "mov",
  "video/webm":     "webm",
  "application/pdf": "pdf",
};

const PRIVATE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/gif":  "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const ALLOWED_MEDIA_FOLDERS = new Set(["media", "avatars", "banners", "posts", "audio", "messages", "merch-designs"]);
const ALLOWED_PRIVATE_FOLDERS = new Set(["docs", "id-verification"]);

// Private-bucket keys follow the invariant: <folder>/<numericUserId>/<nanoid>.<ext>
// This regex enforces that shape before any ownership check.
const PRIVATE_KEY_RE = /^[a-zA-Z0-9_-]+\/\d+\/[a-zA-Z0-9_-]+\.[a-z0-9]{2,4}$/;

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(0)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

async function checkUploadQuota(
  userId: number,
  fileSize: number,
): Promise<{ ok: boolean; error?: string; tier?: string }> {
  const [user] = await db
    .select({ accountTier: usersTable.accountTier, storageUsedBytes: usersTable.storageUsedBytes })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return { ok: false, error: "User not found" };

  const tier = user.accountTier ?? "free";

  const maxUpload = getMaxUploadSize(tier);
  if (fileSize > maxUpload) {
    return {
      ok: false,
      error: `File too large for your plan. ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier allows up to ${formatBytes(maxUpload)} per upload. Upgrade to upload larger files.`,
      tier,
    };
  }

  const storageLimit = getStorageLimit(tier);
  const used = user.storageUsedBytes ?? 0;
  if (used + fileSize > storageLimit) {
    return {
      ok: false,
      error: `Storage limit reached (${formatBytes(used)} of ${formatBytes(storageLimit)} used). Upgrade your plan to upload more.`,
      tier,
    };
  }

  return { ok: true };
}

// Multer memory storage — reject files larger than the elite tier max (10 GB)
// so the buffer is never allocated for clearly oversized requests.
const MAX_FILE_SIZE = getMaxUploadSize("elite");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

router.post("/upload/media", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });

  const folder = (req.body?.folder as string | undefined) ?? "media";
  const contentType = req.file.mimetype;

  const ext = MEDIA_TYPES[contentType];
  if (!ext) return res.status(400).json({ error: `Unsupported content type: ${contentType}` });

  if (!ALLOWED_MEDIA_FOLDERS.has(folder)) {
    return res.status(400).json({ error: "Invalid folder" });
  }

  const userId = (req as any).user.id as number;
  const isAdmin = (req as any).user?.isAdmin === true;
  const fileSize = req.file.size;

  if (!isAdmin) {
    const check = await checkUploadQuota(userId, fileSize);
    if (!check.ok) {
      return res.status(400).json({
        error: check.error,
        storageExceeded: true,
        upgradeRequired: check.tier !== "elite",
      });
    }
  }

  const key = `${folder}/${userId}/${nanoid()}.${ext}`;

  await putR2Object("private", key, req.file.buffer, contentType);

  await db
    .update(usersTable)
    .set({ storageUsedBytes: sql`${usersTable.storageUsedBytes} + ${fileSize}` })
    .where(eq(usersTable.id, userId));

  // Return a short-lived presigned URL so the client can reference the staged
  // object. The file is private until scan_status='clean' (Phase 2 scanner).
  const publicUrl = await getPresignedDownloadUrl(key, 3600);
  req.log.info({ key, folder, bucket: "private" }, "media upload staged (pending scan)");
  logIpEvent(userId, req.ip, "upload");

  return res.json({ publicUrl, key });
});

router.post("/upload/private", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });

  const folder = (req.body?.folder as string | undefined) ?? "docs";
  const contentType = req.file.mimetype;

  const ext = PRIVATE_TYPES[contentType];
  if (!ext) return res.status(400).json({ error: `Unsupported content type: ${contentType}` });

  if (!ALLOWED_PRIVATE_FOLDERS.has(folder)) {
    return res.status(400).json({ error: "Invalid folder" });
  }

  const userId = (req as any).user.id as number;
  const isAdmin = (req as any).user?.isAdmin === true;
  const fileSize = req.file.size;

  if (!isAdmin) {
    const check = await checkUploadQuota(userId, fileSize);
    if (!check.ok) {
      return res.status(400).json({
        error: check.error,
        storageExceeded: true,
        upgradeRequired: check.tier !== "elite",
      });
    }
  }

  const key = `${folder}/${userId}/${nanoid()}.${ext}`;

  await putR2Object("private", key, req.file.buffer, contentType);

  await db
    .update(usersTable)
    .set({ storageUsedBytes: sql`${usersTable.storageUsedBytes} + ${fileSize}` })
    .where(eq(usersTable.id, userId));

  req.log.info({ key, folder, bucket: "private" }, "private upload complete");
  logIpEvent(userId, req.ip, "upload");

  return res.json({ key });
});

router.get("/upload/private-url", requireAuth, async (req, res) => {
  const { key } = req.query as { key?: string };
  if (!key) return res.status(400).json({ error: "key required" });

  if (!PRIVATE_KEY_RE.test(key as string)) {
    return res.status(400).json({ error: "Invalid key format" });
  }

  const segments = (key as string).split("/");
  const keyOwnerId = parseInt(segments[1]!, 10);
  const callerId = (req as any).user.id as number;
  const isAdmin = (req as any).user?.isAdmin === true;

  if (!isAdmin && keyOwnerId !== callerId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const downloadUrl = await getPresignedDownloadUrl(key as string);
  return res.json({ downloadUrl });
});

export default router;
