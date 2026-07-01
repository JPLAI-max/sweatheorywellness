import { Router, type IRouter } from "express";
import { db, postsTable, walletsTable, transactionsTable, usersTable, postUnlocksTable, customRequestsTable, customRequestMessagesTable, notificationsTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getTxFeeRate } from "../lib/fees";
import { getUserSummaries } from "../lib/helpers";
import { ratingFilter } from "../lib/contentRatingFilter";
import { walletLimiter, createLimiter } from "../middlewares/rateLimiter";
import { z } from "zod/v4";
import { sendCustomRequestEmail } from "../lib/email";

const router: IRouter = Router();

// ─── Unlock a paid post ──────────────────────────────────────────────────────

router.post("/posts/:postId/unlock", requireAuth, walletLimiter, async (req, res) => {
  const buyerId = (req as any).user.id;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (!post.price || Number(post.price) <= 0) {
    res.status(400).json({ error: "This post is free" }); return;
  }
  if (post.authorId === buyerId) {
    res.status(400).json({ error: "Cannot unlock your own post" }); return;
  }

  const amount = Number(post.price);
  const [author] = await db.select({ accountTier: usersTable.accountTier })
    .from(usersTable).where(eq(usersTable.id, post.authorId)).limit(1);
  const feeRate = getTxFeeRate(author?.accountTier);
  const fee = Number((amount * feeRate).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  try {
    await db.transaction(async (tx) => {
      const [senderWallet] = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${amount}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${amount}`,
        })
        .where(and(eq(walletsTable.userId, buyerId), gte(walletsTable.balance, String(amount))))
        .returning();

      if (!senderWallet) {
        const err = new Error("Insufficient balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${netAmount}`,
          totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}`,
        })
        .where(eq(walletsTable.userId, post.authorId));

      await tx.insert(transactionsTable).values({
        userId: buyerId,
        type: "purchase",
        amount: String(amount),
        fee: String(fee),
        status: "completed",
        description: `Post unlock: ${post.caption.slice(0, 60)}`,
        relatedUserId: post.authorId,
      });

      await tx.insert(postUnlocksTable).values({
        userId: buyerId,
        postId,
        amountPaid: String(amount),
        hasDownloadAccess: post.allowDownload,
      });
    });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    // Unique constraint violation: concurrent request already completed the unlock
    // The debit was rolled back by the transaction — buyer is NOT charged twice
    if (e.code === "23505") {
      res.status(409).json({ error: "Already unlocked" }); return;
    }
    throw e;
  }

  res.json({ success: true, hasDownloadAccess: post.allowDownload });
});

// ─── Check unlock status ─────────────────────────────────────────────────────

router.get("/posts/:postId/unlock/status", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const [unlock] = await db.select()
    .from(postUnlocksTable)
    .where(and(eq(postUnlocksTable.userId, userId), eq(postUnlocksTable.postId, postId)))
    .limit(1);

  res.json({ unlocked: !!unlock, hasDownloadAccess: unlock?.hasDownloadAccess ?? false });
});

// ─── Purchase Library ────────────────────────────────────────────────────────

router.get("/library", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const offset = Number(req.query.offset ?? 0);

  const viewerUser = (req as any).user;
  const ratFilter = ratingFilter(viewerUser?.nsfwFilter, viewerUser?.verificationMethod);
  const libraryWhere = ratFilter
    ? and(eq(postUnlocksTable.userId, userId), ratFilter)!
    : eq(postUnlocksTable.userId, userId);

  const unlocks = await db.select({
    unlock: postUnlocksTable,
    post: postsTable,
  })
    .from(postUnlocksTable)
    .innerJoin(postsTable, eq(postUnlocksTable.postId, postsTable.id))
    .where(libraryWhere)
    .orderBy(desc(postUnlocksTable.createdAt))
    .limit(limit)
    .offset(offset);

  if (unlocks.length === 0) { res.json([]); return; }

  const authorIds = [...new Set(unlocks.map(u => u.post.authorId))];
  const summaries = await getUserSummaries(authorIds);

  res.json(unlocks.map(u => ({
    ...u.post,
    price: u.post.price !== null ? Number(u.post.price) : null,
    downloadPrice: u.post.downloadPrice !== null ? Number(u.post.downloadPrice) : null,
    author: summaries[u.post.authorId] ?? null,
    unlockedAt: u.unlock.createdAt,
    amountPaid: Number(u.unlock.amountPaid),
    hasDownloadAccess: u.unlock.hasDownloadAccess,
    isUnlocked: true,
  })));
});

// ─── Custom Requests ─────────────────────────────────────────────────────────

const CreateCustomRequestBody = z.object({
  creatorId: z.number().int().positive(),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  contentType: z.enum(["video", "photo", "message", "shoutout", "music", "art", "other"]),
  budget: z.number().positive().max(10000),
  deadline: z.string().optional(),
  referenceUrl: z.string().optional(),
  isPrivate: z.boolean().default(true),
});

router.post("/custom-requests", requireAuth, createLimiter, async (req, res) => {
  const requesterId = (req as any).user.id;
  const parsed = CreateCustomRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { creatorId, budget, ...rest } = parsed.data;
  if (creatorId === requesterId) {
    res.status(400).json({ error: "Cannot request from yourself" }); return;
  }

  const [creator] = await db
    .select({ id: usersTable.id, email: usersTable.email, username: usersTable.username, displayName: usersTable.displayName })
    .from(usersTable).where(eq(usersTable.id, creatorId)).limit(1);
  if (!creator) { res.status(404).json({ error: "Creator not found" }); return; }

  const feeRate = getTxFeeRate(null);
  const fee = Number((budget * feeRate).toFixed(2));

  const [request] = await db.insert(customRequestsTable).values({
    requesterId,
    creatorId,
    budget: String(budget),
    platformFee: String(fee),
    ...rest,
  }).returning();

  const summaries = await getUserSummaries([requesterId, creatorId]);

  // In-app notification to creator
  await db.insert(notificationsTable).values({
    userId: creatorId,
    type: "custom_request",
    actorId: requesterId,
    relatedId: request.id,
    message: `New custom content request: "${parsed.data.title.slice(0, 80)}"`,
  });

  // Email notification to creator
  if (creator.email) {
    sendCustomRequestEmail(
      creator.email,
      summaries[requesterId]?.displayName ?? summaries[requesterId]?.username ?? "Someone",
      summaries[requesterId]?.username ?? "user",
      parsed.data.title,
      budget,
    );
  }

  res.status(201).json({
    ...request,
    budget: Number(request.budget),
    platformFee: Number(request.platformFee),
    counterofferPrice: request.counterofferPrice !== null ? Number(request.counterofferPrice) : null,
    requester: summaries[requesterId] ?? null,
    creator: summaries[creatorId] ?? null,
  });
});

router.get("/custom-requests", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const role = (req.query.role as string) ?? "sent"; // sent | received
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const offset = Number(req.query.offset ?? 0);

  const filter = role === "received"
    ? eq(customRequestsTable.creatorId, userId)
    : eq(customRequestsTable.requesterId, userId);

  const requests = await db.select().from(customRequestsTable)
    .where(filter)
    .orderBy(desc(customRequestsTable.createdAt))
    .limit(limit)
    .offset(offset);

  if (requests.length === 0) { res.json([]); return; }

  const userIds = [...new Set([...requests.map(r => r.requesterId), ...requests.map(r => r.creatorId)])];
  const summaries = await getUserSummaries(userIds);

  res.json(requests.map(r => ({
    ...r,
    budget: Number(r.budget),
    platformFee: Number(r.platformFee),
    counterofferPrice: r.counterofferPrice !== null ? Number(r.counterofferPrice) : null,
    requester: summaries[r.requesterId] ?? null,
    creator: summaries[r.creatorId] ?? null,
  })));
});

router.get("/custom-requests/:id", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(customRequestsTable).where(eq(customRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.requesterId !== userId && request.creatorId !== userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const messages = await db.select().from(customRequestMessagesTable)
    .where(eq(customRequestMessagesTable.requestId, id))
    .orderBy(customRequestMessagesTable.createdAt);

  const userIds = [...new Set([request.requesterId, request.creatorId, ...messages.map(m => m.senderId)])];
  const summaries = await getUserSummaries(userIds);

  res.json({
    ...request,
    budget: Number(request.budget),
    platformFee: Number(request.platformFee),
    counterofferPrice: request.counterofferPrice !== null ? Number(request.counterofferPrice) : null,
    requester: summaries[request.requesterId] ?? null,
    creator: summaries[request.creatorId] ?? null,
    messages: messages.map(m => ({ ...m, sender: summaries[m.senderId] ?? null })),
  });
});

const UpdateCustomRequestBody = z.object({
  status: z.enum(["accepted", "rejected", "counteroffered", "in_progress", "delivered", "cancelled", "completed"]).optional(),
  counterofferPrice: z.number().positive().max(10000).optional(),
  creatorNote: z.string().max(1000).optional(),
  deliveryUrl: z.string().optional(),
  deliveryNote: z.string().max(1000).optional(),
  message: z.string().max(2000).optional(),
  fileUrl: z.string().optional(),
});

router.patch("/custom-requests/:id", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(customRequestsTable).where(eq(customRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = request.creatorId === userId;
  const isRequester = request.requesterId === userId;
  if (!isCreator && !isRequester) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateCustomRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { status, counterofferPrice, creatorNote, deliveryUrl, deliveryNote, message, fileUrl } = parsed.data;

  // Authorization checks per action
  if (status) {
    const creatorActions = new Set(["accepted", "rejected", "counteroffered", "in_progress", "delivered"]);
    const requesterActions = new Set(["cancelled", "completed"]);
    if (creatorActions.has(status) && !isCreator) {
      res.status(403).json({ error: "Only the creator can perform this action" }); return;
    }
    if (requesterActions.has(status) && !isRequester) {
      res.status(403).json({ error: "Only the requester can perform this action" }); return;
    }
    if (status === "counteroffered" && !counterofferPrice) {
      res.status(400).json({ error: "counterofferPrice required for counteroffer" }); return;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (status) updateData.status = status;
  if (counterofferPrice !== undefined) updateData.counterofferPrice = String(counterofferPrice);
  if (creatorNote !== undefined) updateData.creatorNote = creatorNote;
  if (deliveryUrl !== undefined) updateData.deliveryUrl = deliveryUrl;
  if (deliveryNote !== undefined) updateData.deliveryNote = deliveryNote;

  const [updated] = Object.keys(updateData).length > 0
    ? await db.update(customRequestsTable).set(updateData).where(eq(customRequestsTable.id, id)).returning()
    : [request];

  if (message) {
    await db.insert(customRequestMessagesTable).values({
      requestId: id,
      senderId: userId,
      message,
      fileUrl: fileUrl ?? null,
    });
  }

  const summaries = await getUserSummaries([request.requesterId, request.creatorId]);

  res.json({
    ...updated,
    budget: Number(updated.budget),
    platformFee: Number(updated.platformFee),
    counterofferPrice: updated.counterofferPrice !== null ? Number(updated.counterofferPrice) : null,
    requester: summaries[request.requesterId] ?? null,
    creator: summaries[request.creatorId] ?? null,
  });
});

export default router;
