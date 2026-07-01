import { Router, type IRouter } from "express";
import {
  db, usersTable, reportsTable, postsTable, streamsTable,
  transactionsTable, subscriptionsTable, merchProductsTable, takedownRequestsTable,
  muxCleanupLogTable, commentsTable, adminAuditLogTable, walletsTable, merchOrdersTable,
  messagesTable, auctionsTable,
} from "@workspace/db";
import { eq, desc, and, ilike, count, sum, or, inArray, sql, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { requireAdmin } from "../middlewares/adminAuth";
import { z } from "zod";
import { deleteR2Object, deleteR2ObjectsByPrefix, r2KeyExtract } from "../lib/r2";
import { deleteMuxLiveStream, deleteMuxAsset, completeMuxLiveStream } from "../lib/mux";
import { cancelOrder as cancelPrintifyOrder, getOrCreateShop } from "../lib/printify";
import { reconcileStuckMerchOrders } from "./merch";
import { blockLiveStream, blockByAdmin } from "../lib/csam";
import { stopLiveScan } from "../lib/liveScanner";

async function writeAuditLog(adminId: number, action: string, targetType: string, targetId: number | null, reason?: string | null, metadata?: any) {
  await db.insert(adminAuditLogTable).values({
    adminId,
    action,
    targetType,
    targetId: targetId ?? undefined,
    reason: reason ?? null,
    metadata: metadata ?? null,
  });
}

const router: IRouter = Router();

// All admin routes require admin auth — scoped to /admin prefix only
router.use("/admin", requireAdmin);

// ── Stats ──────────────────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res) => {
  const [[totalUsers], [totalCreators], [totalPosts], [activeStreams],
    [totalTransactions], [platformRevenue], [pendingReports], [flaggedContent]] =
    await Promise.all([
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.isNsfwCreator, true)),
      db.select({ count: count() }).from(postsTable),
      db.select({ count: count() }).from(streamsTable).where(eq(streamsTable.status, "live")),
      db.select({ count: count() }).from(transactionsTable),
      db.select({ total: sum(transactionsTable.fee) }).from(transactionsTable).where(eq(transactionsTable.status, "completed")),
      db.select({ count: count() }).from(reportsTable).where(eq(reportsTable.status, "open")),
      db.select({ count: count() }).from(postsTable).where(
        or(eq(postsTable.contentRating, "nsfw"), eq(postsTable.contentRating, "explicit"))
      ),
    ]);

  res.json({
    totalUsers: totalUsers.count,
    totalCreators: totalCreators.count,
    totalPosts: totalPosts.count,
    activeStreams: activeStreams.count,
    totalTransactions: totalTransactions.count,
    platformRevenue: Number(platformRevenue.total ?? 0).toFixed(2),
    pendingReports: pendingReports.count,
    flaggedContent: flaggedContent.count,
  });
});

// ── Users ──────────────────────────────────────────────────────────────────────

// GET /admin/users?q=search&limit=50&offset=0
router.get("/admin/users", async (req, res) => {
  const q = (req.query.q as string) || "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const query = db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
    email: usersTable.email,
    accountTier: usersTable.accountTier,
    isVerified: usersTable.isVerified,
    isNsfwCreator: usersTable.isNsfwCreator,
    isBanned: usersTable.isBanned,
    isAdmin: usersTable.isAdmin,
    idVerificationStatus: usersTable.idVerificationStatus,
    isAgeVerified: usersTable.isAgeVerified,
    verificationMethod: usersTable.verificationMethod,
    isSuspended: usersTable.isSuspended,
    suspendedUntil: usersTable.suspendedUntil,
    isFeatured: usersTable.isFeatured,
    createdAt: usersTable.createdAt,
  }).from(usersTable);

  const rows = q
    ? await query.where(
        or(ilike(usersTable.username, `%${q}%`), ilike(usersTable.email, `%${q}%`), ilike(usersTable.displayName, `%${q}%`))
      ).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset)
    : await query.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);

  res.json(rows);
});

// GET /admin/users/:userId
router.get("/admin/users/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [user] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
    email: usersTable.email,
    accountTier: usersTable.accountTier,
    isVerified: usersTable.isVerified,
    isBanned: usersTable.isBanned,
    isAdmin: usersTable.isAdmin,
    idVerificationStatus: usersTable.idVerificationStatus,
    isNsfwCreator: usersTable.isNsfwCreator,
    isAgeVerified: usersTable.isAgeVerified,
    verificationMethod: usersTable.verificationMethod,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// POST /admin/users/:userId/ban
router.post("/admin/users/:userId/ban", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const { reason } = req.body as { reason?: string };

  const [updated] = await db.update(usersTable)
    .set({ isBanned: true })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isBanned: usersTable.isBanned });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "ban", "user", userId, reason ?? null);
  res.json(updated);
});

// POST /admin/users/:userId/unban
router.post("/admin/users/:userId/unban", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isBanned: false })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isBanned: usersTable.isBanned });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "unban", "user", userId);
  res.json(updated);
});

// POST /admin/users/:userId/verify  (grant platform verification badge)
router.post("/admin/users/:userId/verify", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isVerified: true })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isVerified: usersTable.isVerified });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "verify", "user", userId);
  res.json(updated);
});

// ── ID Verifications ───────────────────────────────────────────────────────────

// GET /admin/id-verifications?status=pending&limit=50&offset=0
router.get("/admin/id-verifications", async (req, res) => {
  const status = (req.query.status as string) || "pending";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
    email: usersTable.email,
    idVerificationStatus: usersTable.idVerificationStatus,
    idImageUrl: usersTable.idImageUrl,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .where(eq(usersTable.idVerificationStatus, status))
    .orderBy(desc(usersTable.createdAt))
    .limit(limit).offset(offset);

  res.json(users);
});

const UpdateIdVerificationBody = z.object({
  status: z.enum(["approved", "rejected"]),
});

// PATCH /admin/users/:userId/id-verification
router.patch("/admin/users/:userId/id-verification", async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const parsed = UpdateIdVerificationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(usersTable)
    .set({ idVerificationStatus: parsed.data.status })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, idVerificationStatus: usersTable.idVerificationStatus });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
});

// ── Reports ────────────────────────────────────────────────────────────────────

// GET /admin/reports?status=open&limit=50&offset=0
// Severity-sorted: underage_csam first, then most recent. No media rendered.
router.get("/admin/reports", async (req, res) => {
  const status = (req.query.status as string) || "open";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const reports = await db
    .select({
      id: reportsTable.id,
      contentType: reportsTable.contentType,
      contentId: reportsTable.contentId,
      reporterId: reportsTable.reporterId,
      reason: reportsTable.reason,
      note: reportsTable.note,
      status: reportsTable.status,
      resolution: reportsTable.resolution,
      reviewedBy: reportsTable.reviewedBy,
      reviewedAt: reportsTable.reviewedAt,
      createdAt: reportsTable.createdAt,
      reporterUsername: usersTable.username,
    })
    .from(reportsTable)
    .leftJoin(usersTable, eq(reportsTable.reporterId, usersTable.id))
    .where(eq(reportsTable.status, status))
    .orderBy(
      sql`CASE WHEN ${reportsTable.reason} = 'underage_csam' THEN 0 ELSE 1 END`,
      desc(reportsTable.createdAt),
    )
    .limit(limit).offset(offset);

  res.json(reports);
});

// POST /admin/reports/:id/dismiss — mark a report as dismissed (no action taken)
router.post("/admin/reports/:id/dismiss", async (req, res) => {
  const reportId = parseInt(req.params.id as string);
  if (isNaN(reportId)) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const adminId = (req as any).user?.id as number;
  const { resolution } = (req.body ?? {}) as { resolution?: string };

  const [updated] = await db.update(reportsTable)
    .set({ status: "dismissed", reviewedBy: adminId, reviewedAt: new Date(), resolution: resolution ?? null })
    .where(and(eq(reportsTable.id, reportId), eq(reportsTable.status, "open")))
    .returning();

  if (!updated) { res.status(404).json({ error: "Report not found or already resolved" }); return; }
  void writeAuditLog(adminId, "dismiss_report", "report", reportId, resolution ?? null);
  res.json(updated);
});

// POST /admin/reports/:id/action — take down the reported content + mark actioned
router.post("/admin/reports/:id/action", async (req, res) => {
  const reportId = parseInt(req.params.id as string);
  if (isNaN(reportId)) { res.status(400).json({ error: "Invalid reportId" }); return; }
  const adminId = (req as any).user?.id as number;

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, reportId), eq(reportsTable.status, "open")))
    .limit(1);

  if (!report) { res.status(404).json({ error: "Report not found or already resolved" }); return; }
  const { contentType, contentId, reason } = report;

  try {
    if (contentType === "live_stream") {
      const streamId = parseInt(contentId, 10);
      if (isNaN(streamId)) { res.status(400).json({ error: "Invalid stream content_id" }); return; }
      const [stream] = await db
        .select({ id: streamsTable.id, muxLiveStreamId: streamsTable.muxLiveStreamId })
        .from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
      if (stream?.muxLiveStreamId) {
        await completeMuxLiveStream(stream.muxLiveStreamId);
      }
      await blockLiveStream(streamId, {
        raw: { source: "admin_report_action", reportId, reason },
        hashMatch: false,
        csamScore: 0,
      });
      stopLiveScan(streamId);
    } else if (contentType === "post") {
      const assetId = parseInt(contentId, 10);
      if (isNaN(assetId)) { res.status(400).json({ error: "Invalid post content_id" }); return; }
      await blockByAdmin(assetId, "post");
    } else if (contentType === "dm") {
      const assetId = parseInt(contentId, 10);
      if (isNaN(assetId)) { res.status(400).json({ error: "Invalid dm content_id" }); return; }
      await blockByAdmin(assetId, "dm_message");
    } else if (contentType === "user") {
      const userId = parseInt(contentId, 10);
      if (isNaN(userId)) { res.status(400).json({ error: "Invalid user content_id" }); return; }
      await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, userId));
    }
  } catch (err: unknown) {
    req.log.error({ err, reportId, contentType, contentId }, "admin: takedown action failed");
    res.status(500).json({ error: "Takedown action failed" });
    return;
  }

  const [updated] = await db.update(reportsTable)
    .set({ status: "actioned", reviewedBy: adminId, reviewedAt: new Date() })
    .where(eq(reportsTable.id, reportId))
    .returning();

  void writeAuditLog(adminId, "action_report", "report", reportId, reason, { contentType, contentId });
  res.json(updated);
});

// ── Posts (content moderation) ─────────────────────────────────────────────────

// GET /admin/posts?contentRating=nsfw&authorId=123&limit=50&offset=0
router.get("/admin/posts", async (req, res) => {
  const contentRating = req.query.contentRating as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let query = db.select({
    id: postsTable.id,
    authorId: postsTable.authorId,
    type: postsTable.type,
    caption: postsTable.caption,
    mediaUrl: postsTable.mediaUrl,
    contentRating: postsTable.contentRating,
    visibility: postsTable.visibility,
    likesCount: postsTable.likesCount,
    viewsCount: postsTable.viewsCount,
    isPinned: postsTable.isPinned,
    isFeatured: postsTable.isFeatured,
    createdAt: postsTable.createdAt,
  }).from(postsTable).$dynamic();

  if (contentRating && contentRating !== "all") {
    query = query.where(eq(postsTable.contentRating, contentRating));
  }

  const posts = await query.orderBy(desc(postsTable.createdAt)).limit(limit).offset(offset);

  const authorIds = [...new Set(posts.map(p => p.authorId))];
  const authors = authorIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = Object.fromEntries(authors.map(a => [a.id, a.username]));

  res.json(posts.map(p => ({ ...p, authorUsername: authorMap[p.authorId] ?? null })));
});

const UpdatePostBody = z.object({
  contentRating: z.enum(["safe", "suggestive", "mature", "nsfw", "explicit"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

// PATCH /admin/posts/:postId
router.patch("/admin/posts/:postId", async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(postsTable)
    .set(parsed.data)
    .where(eq(postsTable.id, postId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(updated);
});

// DELETE /admin/posts/:postId
router.delete("/admin/posts/:postId", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const { reason } = req.body as { reason?: string } || {};

  const [post] = await db
    .select({ id: postsTable.id, mediaUrl: postsTable.mediaUrl, thumbnailUrl: postsTable.thumbnailUrl, authorId: postsTable.authorId })
    .from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  await db.delete(postsTable).where(eq(postsTable.id, postId));

  // Fire-and-forget: delete R2 media and thumbnail objects
  if (post.mediaUrl) {
    const ref = r2KeyExtract(post.mediaUrl);
    if (ref) void deleteR2Object(ref.bucket, ref.key);
  }
  if (post.thumbnailUrl) {
    const ref = r2KeyExtract(post.thumbnailUrl);
    if (ref) void deleteR2Object(ref.bucket, ref.key);
  }

  void writeAuditLog(adminId, "delete_post", "post", postId, reason ?? null, { authorId: post.authorId });
  res.json({ ok: true });
});

// ── Streams ────────────────────────────────────────────────────────────────────

// GET /admin/streams?status=live&limit=50&offset=0
router.get("/admin/streams", async (req, res) => {
  const status = (req.query.status as string) || "live";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const streams = await db.select({
    id: streamsTable.id,
    hostId: streamsTable.hostId,
    title: streamsTable.title,
    status: streamsTable.status,
    audienceType: streamsTable.audienceType,
    viewerCount: streamsTable.viewerCount,
    createdAt: streamsTable.createdAt,
    endedAt: streamsTable.endedAt,
    muxLiveStreamId: streamsTable.muxLiveStreamId,
  }).from(streamsTable)
    .where(eq(streamsTable.status, status))
    .orderBy(desc(streamsTable.createdAt))
    .limit(limit).offset(offset);

  const hostIds = [...new Set(streams.map(s => s.hostId))];
  const hosts = hostIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
        .from(usersTable).where(inArray(usersTable.id, hostIds))
    : [];
  const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));

  res.json(streams.map(s => ({
    ...s,
    host: hostMap[s.hostId] ?? null,
  })));
});

// PATCH /admin/streams/:streamId/end
router.patch("/admin/streams/:streamId/end", async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  if (isNaN(streamId)) { res.status(400).json({ error: "Invalid streamId" }); return; }

  const [stream] = await db.select({
    id: streamsTable.id,
    muxLiveStreamId: streamsTable.muxLiveStreamId,
    muxAssetId: streamsTable.muxAssetId,
  }).from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);

  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }

  const [updated] = await db.update(streamsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(streamsTable.id, streamId))
    .returning({ id: streamsTable.id, status: streamsTable.status });

  if (stream.muxLiveStreamId) {
    await deleteMuxLiveStream(stream.muxLiveStreamId);
  }
  if (stream.muxAssetId) {
    await deleteMuxAsset(stream.muxAssetId);
  }

  res.json(updated);
});

// ── Transactions ───────────────────────────────────────────────────────────────

// GET /admin/transactions?type=tip&status=completed&limit=50&offset=0
router.get("/admin/transactions", async (req, res) => {
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  let query = db.select({
    id: transactionsTable.id,
    userId: transactionsTable.userId,
    type: transactionsTable.type,
    amount: transactionsTable.amount,
    fee: transactionsTable.fee,
    status: transactionsTable.status,
    description: transactionsTable.description,
    relatedUserId: transactionsTable.relatedUserId,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable).$dynamic();

  const conditions = [];
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (status) conditions.push(eq(transactionsTable.status, status));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const txns = await query.orderBy(desc(transactionsTable.createdAt)).limit(limit).offset(offset);

  const userIds = [...new Set([...txns.map(t => t.userId), ...txns.filter(t => t.relatedUserId).map(t => t.relatedUserId!)])];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));

  res.json(txns.map(t => ({
    ...t,
    amount: Number(t.amount),
    fee: Number(t.fee),
    username: userMap[t.userId] ?? null,
    relatedUsername: t.relatedUserId ? (userMap[t.relatedUserId] ?? null) : null,
  })));
});

// PATCH /admin/users/:userId/tier — set account tier without payment
router.patch("/admin/users/:userId/tier", async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { tier } = req.body as { tier?: string };
  const validTiers = ["free", "creator", "pro", "elite"];
  if (!tier || !validTiers.includes(tier)) {
    res.status(400).json({ error: "tier must be one of: free, creator, pro, elite" });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ accountTier: tier })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, accountTier: usersTable.accountTier });

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ok: true, ...user });
});

// POST /admin/grant-subscription — grant free access to a creator's content (no wallet charge)
router.post("/admin/grant-subscription", async (req, res) => {
  const { subscriberId, creatorId, days = 30 } = req.body as {
    subscriberId?: number; creatorId?: number; days?: number;
  };

  if (!subscriberId || !creatorId) {
    res.status(400).json({ error: "subscriberId and creatorId are required" });
    return;
  }
  if (subscriberId === creatorId) {
    res.status(400).json({ error: "Cannot grant a subscription to oneself" });
    return;
  }
  const clampedDays = Math.min(Math.max(1, days), 3650);

  const [[subscriber], [creator]] = await Promise.all([
    db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable).where(eq(usersTable.id, subscriberId)).limit(1),
    db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable).where(eq(usersTable.id, creatorId)).limit(1),
  ]);

  if (!subscriber) { res.status(404).json({ error: "Subscriber not found" }); return; }
  if (!creator)    { res.status(404).json({ error: "Creator not found" }); return; }

  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + clampedDays);

  const [existing] = await db.select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.subscriberId, subscriberId), eq(subscriptionsTable.creatorId, creatorId)))
    .limit(1);

  let sub: typeof subscriptionsTable.$inferSelect;
  if (existing) {
    [sub] = await db.update(subscriptionsTable)
      .set({ status: "active", price: "0.00", currentPeriodStart: new Date(), currentPeriodEnd: periodEnd, cancelledAt: null })
      .where(eq(subscriptionsTable.id, existing.id))
      .returning();
  } else {
    [sub] = await db.insert(subscriptionsTable)
      .values({ subscriberId, creatorId, price: "0.00", currentPeriodEnd: periodEnd })
      .returning();
  }

  res.json({ ok: true, subscription: { ...sub, price: Number(sub.price) } });
});

// PATCH /admin/users/:userId/make-admin — grant or revoke admin
router.patch("/admin/users/:userId/make-admin", async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const grant = req.body?.grant !== false; // default true
  const [updated] = await db.update(usersTable).set({ isAdmin: grant }).where(eq(usersTable.id, userId)).returning({ id: usersTable.id, username: usersTable.username, isAdmin: usersTable.isAdmin });
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
});

// DELETE /admin/users/:userId — permanently delete a user and all their data
router.delete("/admin/users/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [user] = await db.select({
    id: usersTable.id,
    isAdmin: usersTable.isAdmin,
    username: usersTable.username,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.isAdmin) { res.status(403).json({ error: "Cannot delete admin accounts" }); return; }

  await db.delete(usersTable).where(eq(usersTable.id, userId));

  // Fire-and-forget: sweep all user-owned objects from both buckets by prefix.
  // Using prefix-based listing catches orphaned uploads that are no longer
  // referenced in DB rows (e.g. abandoned uploads, replaced assets).
  const uid = String(userId);
  for (const folder of ["avatars", "banners", "posts", "media"]) {
    void deleteR2ObjectsByPrefix("media", `${folder}/${uid}/`);
  }
  for (const folder of ["docs", "id-verification"]) {
    void deleteR2ObjectsByPrefix("private", `${folder}/${uid}/`);
  }

  res.json({ ok: true, deleted: user.username });
});

// POST /admin/users/purge — delete ALL non-admin users and their data (cascade wipes posts, follows, etc.)
// Requires explicit confirmation token in body to prevent accidental wipes.
router.post("/admin/users/purge", async (req, res) => {
  if (!req.body || req.body.confirm !== "DELETE_ALL_USERS") {
    res.status(400).json({
      error: "Missing confirmation. Send { \"confirm\": \"DELETE_ALL_USERS\" } in the request body to proceed.",
    });
    return;
  }

  const deleted = await db.delete(usersTable)
    .where(eq(usersTable.isAdmin, false))
    .returning({ id: usersTable.id, username: usersTable.username });

  res.json({ ok: true, deletedCount: deleted.length, deleted: deleted.map(u => u.username) });
});

// ── Admin Merch Management ──────────────────────────────────────────────────────

const AdminMerchCreateBody = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(1000).optional(),
  productType: z.enum(["shirt","hoodie","hat","poster","sticker","mug","tote_bag","phone_case","vinyl_cover","sweatpants"]),
  designUrl: z.string().url().optional().or(z.literal("")),
  previewImageUrl: z.string().url().optional().or(z.literal("")),
  colors: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  basePrice: z.number().min(0.01).max(9999),
  creatorProfit: z.number().min(0),
  isFeatured: z.boolean().default(false),
  isLimitedDrop: z.boolean().default(false),
  stockLimit: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
});

const AdminMerchUpdateBody = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(1000).optional(),
  previewImageUrl: z.string().url().optional().or(z.literal("")),
  designUrl: z.string().url().optional().or(z.literal("")),
  basePrice: z.number().min(0.01).optional(),
  creatorProfit: z.number().min(0).optional(),
  status: z.enum(["active","draft","archived"]).optional(),
  isFeatured: z.boolean().optional(),
  isLimitedDrop: z.boolean().optional(),
  stockLimit: z.number().int().positive().nullable().optional(),
});

// GET /admin/merch/products — list all merch products
router.get("/admin/merch/products", async (_req, res) => {
  const rows = await db.select().from(merchProductsTable).orderBy(desc(merchProductsTable.createdAt)).limit(200);
  if (rows.length === 0) { res.json([]); return; }
  const creatorIds = [...new Set(rows.map(r => r.creatorId))];
  const summaries = await getUserSummaries(creatorIds);
  res.json(rows.map(r => ({
    ...r,
    basePrice: Number(r.basePrice),
    creatorProfit: Number(r.creatorProfit),
    creator: summaries[r.creatorId] ?? null,
  })));
});

// POST /admin/merch/products — create a merch product (uses admin's own user ID as creator)
router.post("/admin/merch/products", async (req, res) => {
  const adminId = (req as any).user.id as number;
  const body = AdminMerchCreateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const d = body.data;
  const [row] = await db.insert(merchProductsTable).values({
    creatorId: adminId,
    title: d.title,
    description: d.description ?? null,
    productType: d.productType,
    designUrl: d.designUrl || null,
    previewImageUrl: d.previewImageUrl || null,
    colors: d.colors,
    sizes: d.sizes,
    basePrice: String(d.basePrice),
    creatorProfit: String(d.creatorProfit),
    isFeatured: d.isFeatured,
    isLimitedDrop: d.isLimitedDrop,
    stockLimit: d.stockLimit ?? null,
    tags: d.tags,
    status: "active",
  }).returning();

  res.status(201).json({ ...row, basePrice: Number(row.basePrice), creatorProfit: Number(row.creatorProfit) });
});

// PATCH /admin/merch/products/:id — update any product
router.patch("/admin/merch/products/:id", async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = AdminMerchUpdateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updates: Record<string, any> = { ...body.data };
  if (body.data.basePrice !== undefined) updates.basePrice = String(body.data.basePrice);
  if (body.data.creatorProfit !== undefined) updates.creatorProfit = String(body.data.creatorProfit);

  const [updated] = await db.update(merchProductsTable).set(updates).where(eq(merchProductsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, basePrice: Number(updated.basePrice), creatorProfit: Number(updated.creatorProfit) });
});

// DELETE /admin/merch/products/:id — delete any product
router.delete("/admin/merch/products/:id", async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(merchProductsTable).where(eq(merchProductsTable.id, id)).returning({ id: merchProductsTable.id });
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ── Takedown Requests ──────────────────────────────────────────────────────────

// GET /admin/takedown-requests?status=pending&limit=50&offset=0
router.get("/admin/takedown-requests", async (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  const requests = await db.select().from(takedownRequestsTable)
    .where(eq(takedownRequestsTable.status, status))
    .orderBy(takedownRequestsTable.createdAt) // oldest first — 48h compliance window
    .limit(limit).offset(offset);

  res.json(requests);
});

const UpdateTakedownBody = z.object({
  status: z.enum(["removed", "rejected"]),
  rejectionReason: z.string().max(500).optional(),
});

// PATCH /admin/takedown-requests/:id
router.patch("/admin/takedown-requests/:id", async (req, res) => {
  const adminId = (req as any).user?.id ?? null;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateTakedownBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { status, rejectionReason } = parsed.data;

  const [request] = await db.select().from(takedownRequestsTable)
    .where(eq(takedownRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found" }); return; }

  // If removing: delete the associated post if postId is known
  if (status === "removed" && request.postId) {
    await db.delete(postsTable).where(eq(postsTable.id, request.postId));
  }

  const [updated] = await db.update(takedownRequestsTable)
    .set({
      status,
      rejectionReason: rejectionReason ?? null,
      resolvedBy: adminId,
      resolvedAt: new Date(),
    })
    .where(eq(takedownRequestsTable.id, id))
    .returning();

  res.json(updated);
});

// ── Mux Cleanup Log ────────────────────────────────────────────────────────────

// GET /admin/mux-cleanup-log/export?reason=orphaned_asset — download as CSV
router.get("/admin/mux-cleanup-log/export", async (req, res) => {
  const reason = req.query.reason as string | undefined;

  let query = db.select({
    id: muxCleanupLogTable.id,
    uploadId: muxCleanupLogTable.uploadId,
    muxAssetId: muxCleanupLogTable.muxAssetId,
    userId: muxCleanupLogTable.userId,
    reason: muxCleanupLogTable.reason,
    durationSeconds: muxCleanupLogTable.durationSeconds,
    deletedAt: muxCleanupLogTable.deletedAt,
  }).from(muxCleanupLogTable).$dynamic();

  if (reason) {
    query = query.where(eq(muxCleanupLogTable.reason, reason));
  }

  const rows = await query.orderBy(desc(muxCleanupLogTable.deletedAt));

  const userIds = [...new Set(rows.map(r => r.userId).filter((id): id is number => id != null))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));

  function csvEscape(val: string | number | null | undefined): string {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const header = ["id", "reason", "muxAssetId", "uploadId", "username", "durationSeconds", "deletedAt"];
  const csvRows = rows.map(r => [
    csvEscape(r.id),
    csvEscape(r.reason),
    csvEscape(r.muxAssetId),
    csvEscape(r.uploadId),
    csvEscape(r.userId != null ? (userMap[r.userId] ?? "") : ""),
    csvEscape(r.durationSeconds),
    csvEscape(r.deletedAt?.toISOString() ?? ""),
  ].join(","));

  const csv = [header.join(","), ...csvRows].join("\n");

  const filename = reason ? `mux-cleanup-${reason}.csv` : "mux-cleanup-log.csv";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// GET /admin/mux-cleanup-log?limit=50&offset=0&reason=orphaned_asset
router.get("/admin/mux-cleanup-log", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const reason = req.query.reason as string | undefined;

  let query = db.select({
    id: muxCleanupLogTable.id,
    uploadId: muxCleanupLogTable.uploadId,
    muxAssetId: muxCleanupLogTable.muxAssetId,
    userId: muxCleanupLogTable.userId,
    reason: muxCleanupLogTable.reason,
    durationSeconds: muxCleanupLogTable.durationSeconds,
    deletedAt: muxCleanupLogTable.deletedAt,
  }).from(muxCleanupLogTable).$dynamic();

  if (reason) {
    query = query.where(eq(muxCleanupLogTable.reason, reason));
  }

  const rows = await query.orderBy(desc(muxCleanupLogTable.deletedAt)).limit(limit).offset(offset);

  const userIds = [...new Set(rows.map(r => r.userId).filter((id): id is number => id != null))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
        .from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  res.json(rows.map(r => ({
    ...r,
    user: r.userId != null ? (userMap[r.userId] ?? null) : null,
  })));
});

// GET /admin/mux-cleanup-log/stats — totals and top offenders
router.get("/admin/mux-cleanup-log/stats", async (_req, res) => {
  const [[totalRows], [orphanedUploads], [orphanedAssets], [erroredTotal], topUsers, byCauseRows] = await Promise.all([
    db.select({ total: count() }).from(muxCleanupLogTable),
    db.select({ total: count() }).from(muxCleanupLogTable).where(eq(muxCleanupLogTable.reason, "orphaned_upload")),
    db.select({ total: count() }).from(muxCleanupLogTable).where(
      or(eq(muxCleanupLogTable.reason, "orphaned_asset"), eq(muxCleanupLogTable.reason, "orphaned_asset_webhook"))
    ),
    db.select({ total: count() }).from(muxCleanupLogTable).where(
      or(
        eq(muxCleanupLogTable.reason, "errored_asset_webhook"),
        eq(muxCleanupLogTable.reason, "errored_upload_webhook"),
        eq(muxCleanupLogTable.reason, "errored_asset_daily_sweep"),
        eq(muxCleanupLogTable.reason, "errored_upload_daily_sweep"),
      )
    ),
    db.select({
      userId: muxCleanupLogTable.userId,
      total: count(),
    })
      .from(muxCleanupLogTable)
      .where(sql`${muxCleanupLogTable.userId} is not null`)
      .groupBy(muxCleanupLogTable.userId)
      .orderBy(desc(count()))
      .limit(10),
    db.select({ reason: muxCleanupLogTable.reason, total: count() })
      .from(muxCleanupLogTable)
      .groupBy(muxCleanupLogTable.reason)
      .orderBy(desc(count())),
  ]);

  const topUserIds = topUsers.map(r => r.userId).filter((id): id is number => id != null);
  const topUserDetails = topUserIds.length > 0
    ? await db.select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName })
        .from(usersTable).where(inArray(usersTable.id, topUserIds))
    : [];
  const topUserMap = Object.fromEntries(topUserDetails.map(u => [u.id, u]));

  const byCause: Record<string, number> = {};
  for (const row of byCauseRows) {
    if (row.reason != null) byCause[row.reason] = row.total;
  }

  res.json({
    total: totalRows.total,
    orphanedUploads: orphanedUploads.total,
    orphanedAssets: orphanedAssets.total,
    erroredTotal: erroredTotal.total,
    byCause,
    topUsers: topUsers.map(r => ({
      userId: r.userId,
      total: r.total,
      user: r.userId != null ? (topUserMap[r.userId] ?? null) : null,
    })),
  });
});

// ── Comments ──────────────────────────────────────────────────────────────────

// DELETE /admin/comments/:commentId
router.delete("/admin/comments/:commentId", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const commentId = parseInt(req.params.commentId as string);
  if (isNaN(commentId)) { res.status(400).json({ error: "Invalid commentId" }); return; }
  const { reason } = req.body as { reason?: string } || {};

  const [comment] = await db.select({ id: commentsTable.id, postId: commentsTable.postId })
    .from(commentsTable).where(eq(commentsTable.id, commentId)).limit(1);
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }

  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  void writeAuditLog(adminId, "delete_comment", "comment", commentId, reason ?? null, { postId: comment.postId });
  res.status(204).end();
});

// ── Enhanced User Moderation ──────────────────────────────────────────────────

// PATCH /admin/users/:userId/profile — edit bio and/or avatar URL
const EditProfileBody = z.object({
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

router.patch("/admin/users/:userId/profile", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const parsed = EditProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, any> = {};
  if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio;
  if (parsed.data.avatarUrl !== undefined) updates.avatarUrl = parsed.data.avatarUrl || null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  // Fetch existing avatar URL before updating so we can clean up old R2 object
  const [existing] = await db.select({ avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, bio: usersTable.bio, avatarUrl: usersTable.avatarUrl });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  // Fire-and-forget: delete old R2 avatar if it was replaced with a different URL
  if (existing?.avatarUrl && parsed.data.avatarUrl !== undefined && existing.avatarUrl !== (parsed.data.avatarUrl || null)) {
    const oldRef = r2KeyExtract(existing.avatarUrl);
    if (oldRef) void deleteR2Object(oldRef.bucket, oldRef.key);
  }

  void writeAuditLog(adminId, "edit_profile", "user", userId, null, updates);
  res.json(updated);
});

// POST /admin/users/:userId/suspend — timed suspension
const SuspendBody = z.object({
  durationDays: z.number().int().min(1).max(365),
  reason: z.string().max(500).optional(),
});

router.post("/admin/users/:userId/suspend", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const parsed = SuspendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const suspendedUntil = new Date();
  suspendedUntil.setDate(suspendedUntil.getDate() + parsed.data.durationDays);

  const [updated] = await db.update(usersTable)
    .set({ isSuspended: true, suspendedUntil })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isSuspended: usersTable.isSuspended, suspendedUntil: usersTable.suspendedUntil });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "suspend", "user", userId, parsed.data.reason ?? null, { durationDays: parsed.data.durationDays, suspendedUntil });
  res.json(updated);
});

// POST /admin/users/:userId/unsuspend
router.post("/admin/users/:userId/unsuspend", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isSuspended: false, suspendedUntil: null })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isSuspended: usersTable.isSuspended });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "unsuspend", "user", userId);
  res.json(updated);
});

// ── Post Pin / Feature ────────────────────────────────────────────────────────

// POST /admin/posts/:postId/pin
router.post("/admin/posts/:postId/pin", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const [updated] = await db.update(postsTable)
    .set({ isPinned: true })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, isPinned: postsTable.isPinned });

  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "pin_post", "post", postId);
  res.json(updated);
});

// POST /admin/posts/:postId/unpin
router.post("/admin/posts/:postId/unpin", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const [updated] = await db.update(postsTable)
    .set({ isPinned: false })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, isPinned: postsTable.isPinned });

  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "unpin_post", "post", postId);
  res.json(updated);
});

// ── User Feature ──────────────────────────────────────────────────────────────

// POST /admin/users/:userId/feature
router.post("/admin/users/:userId/feature", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isFeatured: true })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isFeatured: usersTable.isFeatured });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "feature_creator", "user", userId);
  res.json(updated);
});

// POST /admin/users/:userId/unfeature
router.post("/admin/users/:userId/unfeature", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isFeatured: false })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, username: usersTable.username, isFeatured: usersTable.isFeatured });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  void writeAuditLog(adminId, "unfeature_creator", "user", userId);
  res.json(updated);
});

// ── Post Feature / Hide ───────────────────────────────────────────────────────

// POST /admin/posts/:postId/feature
router.post("/admin/posts/:postId/feature", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const [updated] = await db.update(postsTable).set({ isFeatured: true })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, isFeatured: postsTable.isFeatured });
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "feature_post", "post", postId);
  res.json(updated);
});

// POST /admin/posts/:postId/unfeature
router.post("/admin/posts/:postId/unfeature", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const [updated] = await db.update(postsTable).set({ isFeatured: false })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, isFeatured: postsTable.isFeatured });
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "unfeature_post", "post", postId);
  res.json(updated);
});

// POST /admin/posts/:postId/hide — sets visibility to "hidden" (removes from public feed)
router.post("/admin/posts/:postId/hide", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const [updated] = await db.update(postsTable).set({ visibility: "hidden" })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, visibility: postsTable.visibility });
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "hide_post", "post", postId);
  res.json(updated);
});

// POST /admin/posts/:postId/unhide — restores visibility to "public"
router.post("/admin/posts/:postId/unhide", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const [updated] = await db.update(postsTable).set({ visibility: "public" })
    .where(eq(postsTable.id, postId))
    .returning({ id: postsTable.id, visibility: postsTable.visibility });
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  void writeAuditLog(adminId, "unhide_post", "post", postId);
  res.json(updated);
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

// GET /admin/audit-log?page=1&limit=50&action=ban
router.get("/admin/audit-log", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const action = req.query.action as string | undefined;

  const adminUser = usersTable;
  let query = db.select({
    id: adminAuditLogTable.id,
    adminId: adminAuditLogTable.adminId,
    adminUsername: adminUser.username,
    adminDisplayName: adminUser.displayName,
    action: adminAuditLogTable.action,
    targetType: adminAuditLogTable.targetType,
    targetId: adminAuditLogTable.targetId,
    reason: adminAuditLogTable.reason,
    metadata: adminAuditLogTable.metadata,
    createdAt: adminAuditLogTable.createdAt,
  })
    .from(adminAuditLogTable)
    .leftJoin(adminUser, eq(adminAuditLogTable.adminId, adminUser.id))
    .$dynamic();

  if (action) {
    query = query.where(eq(adminAuditLogTable.action, action));
  }

  const rows = await query.orderBy(desc(adminAuditLogTable.createdAt)).limit(limit).offset(offset);
  res.json(rows);
});

// ── Merch Reconcile (on-demand) ────────────────────────────────────────────────

// POST /admin/merch/reconcile — trigger a reconcile sweep immediately
router.post("/admin/merch/reconcile", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const result = await reconcileStuckMerchOrders();
  void writeAuditLog(adminId, "merch_reconcile", "merch_order", null, null, result);
  res.json({ ok: true, ...result });
});

// ── Merch Order Admin Reversal ─────────────────────────────────────────────────

const AdminMerchRefundBody = z.object({
  reason: z.string().optional(),
});

// POST /admin/merch/orders/:orderId/refund
// Admin-only: reverse a completed merch order — credit buyer wallet, claw back creator payout.
// This credits the buyer's INTERNAL wallet. Real card refunds via CCBill are a later addition.
router.post("/admin/merch/orders/:orderId/refund", async (req, res) => {
  const adminId = (req as any).user?.id as number;
  const orderId = parseInt(req.params.orderId as string);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid orderId" }); return; }

  const parsed = AdminMerchRefundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { reason } = parsed.data;

  // Pre-check existence and terminal status before taking the lock
  const [preCheck] = await db.select().from(merchOrdersTable)
    .where(eq(merchOrdersTable.id, orderId)).limit(1);
  if (!preCheck) { res.status(404).json({ error: "Order not found" }); return; }
  if (preCheck.status === "refunded" || preCheck.status === "failed") {
    res.status(200).json({ ok: true, status: preCheck.status, alreadyResolved: true });
    return;
  }

  // Best-effort Printify cancel — only when fulfillmentId is a real Printify ID (not our local placeholder)
  if (preCheck.fulfillmentId && !preCheck.fulfillmentId.startsWith("POD-")) {
    try {
      const shopId = await getOrCreateShop();
      await cancelPrintifyOrder(shopId, preCheck.fulfillmentId);
    } catch {
      // Ignore — order may already be in production
    }
  }

  const totalAmount = Number(preCheck.totalAmount);
  const creatorPayout = Number(preCheck.creatorPayout);
  const buyerId = preCheck.buyerId;
  const creatorId = preCheck.creatorId;

  // Atomic reversal — row-locked and idempotent on status guard inside the transaction
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(merchOrdersTable)
      .where(eq(merchOrdersTable.id, orderId)).for("update");
    if (!order || order.status === "refunded" || order.status === "failed") return;

    // Credit buyer back
    await tx.update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} + ${String(totalAmount)}`,
        totalSpent: sql`${walletsTable.totalSpent} - ${String(totalAmount)}`,
      })
      .where(eq(walletsTable.userId, buyerId));

    await tx.insert(transactionsTable).values({
      userId: buyerId,
      type: "deposit",
      amount: String(totalAmount),
      fee: "0",
      status: "completed",
      description: `Admin refund: ${order.productTitle}${reason ? ` — ${reason}` : ""}`,
      relatedUserId: creatorId,
    });

    // Claw back creator payout — allow negative balance (they owe it back)
    await tx.update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} - ${String(creatorPayout)}`,
        totalEarned: sql`${walletsTable.totalEarned} - ${String(creatorPayout)}`,
      })
      .where(eq(walletsTable.userId, creatorId));

    await tx.insert(transactionsTable).values({
      userId: creatorId,
      type: "withdrawal",
      amount: String(creatorPayout),
      fee: "0",
      status: "completed",
      description: `Admin reversal: ${order.productTitle}${reason ? ` — ${reason}` : ""}`,
      relatedUserId: buyerId,
    });

    await tx.update(merchOrdersTable)
      .set({ status: "refunded", refundReason: reason ?? null, updatedAt: new Date() })
      .where(eq(merchOrdersTable.id, orderId));
  });

  req.log.warn({ orderId, buyerId, creatorId, totalAmount, creatorPayout }, "Admin merch refund issued; creator balance may be negative");
  void writeAuditLog(adminId, "merch_refund", "merch_order", orderId, reason ?? null, {
    buyerId, creatorId, totalAmount, creatorPayout,
  });

  res.json({ ok: true, orderId, totalAmount, creatorPayout });
});

// POST /admin/backfill-scan-status — one-shot: mark all pending rows as clean
router.post("/admin/backfill-scan-status", requireAdmin, async (req, res) => {
  const [p] = await db.update(postsTable).set({ scanStatus: "clean" }).where(eq(postsTable.scanStatus, "pending")).returning({ id: postsTable.id });
  const [m] = await db.update(messagesTable).set({ scanStatus: "clean" }).where(eq(messagesTable.scanStatus, "pending")).returning({ id: messagesTable.id });
  const [mp] = await db.update(merchProductsTable).set({ scanStatus: "clean" }).where(eq(merchProductsTable.scanStatus, "pending")).returning({ id: merchProductsTable.id });
  const [a] = await db.update(auctionsTable).set({ scanStatus: "clean" }).where(eq(auctionsTable.scanStatus, "pending")).returning({ id: auctionsTable.id });
  const postsFixed = await db.$count(postsTable, eq(postsTable.scanStatus, "clean"));
  req.log.warn({ postsFixed }, "Admin scan-status backfill ran");
  res.json({ ok: true, postsFixed });
});

export default router;
