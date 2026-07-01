import { Router, type IRouter, type Response } from "express";
import { db, commentsTable, postsTable, notificationsTable, followsTable, subscriptionsTable } from "@workspace/db";
import { eq, desc, sql, and, or, gte } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { CreateCommentBody, GetCommentsQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";

const router: IRouter = Router();

// ── Shared visibility gate ────────────────────────────────────────────────────
// Mirrors the check in GET /posts/:postId so comment endpoints respect the same
// access-control model. Returns the post on success, or writes a 404 and returns
// null (callers must guard on null and return immediately).
async function assertPostVisible(
  postId: number,
  viewerId: number | undefined,
  isAdmin: boolean,
  res: Response,
): Promise<{ id: number; visibility: string; authorId: number } | null> {
  const [post] = await db
    .select({ id: postsTable.id, visibility: postsTable.visibility, authorId: postsTable.authorId })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);

  if (!post) { res.status(404).json({ error: "Post not found" }); return null; }
  if (isAdmin || post.authorId === viewerId) return post;
  if (post.visibility === "private") { res.status(404).json({ error: "Post not found" }); return null; }
  if (post.visibility === "public") return post;

  // followers / subscribers_only — must be authenticated
  if (!viewerId) { res.status(404).json({ error: "Post not found" }); return null; }

  if (post.visibility === "followers") {
    const [follow] = await db
      .select({ id: followsTable.id })
      .from(followsTable)
      .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, post.authorId)))
      .limit(1);
    if (!follow) { res.status(404).json({ error: "Post not found" }); return null; }
  } else {
    // subscribers_only — active OR cancelled but still within paid period
    const now = new Date();
    const [sub] = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(and(
        eq(subscriptionsTable.subscriberId, viewerId),
        eq(subscriptionsTable.creatorId, post.authorId),
        or(
          eq(subscriptionsTable.status, "active"),
          and(
            eq(subscriptionsTable.status, "cancelled"),
            gte(subscriptionsTable.currentPeriodEnd, now),
          ),
        ),
      ))
      .limit(1);
    if (!sub) { res.status(404).json({ error: "Post not found" }); return null; }
  }

  return post;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/posts/:postId/comments", optionalAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post ID" }); return; }

  const viewerId = (req as any).userId as number | undefined;
  const isAdmin = (req as any).user?.isAdmin === true;

  const post = await assertPostVisible(postId, viewerId, isAdmin, res);
  if (!post) return;

  const parsed = GetCommentsQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const comments = await db.select().from(commentsTable)
    .where(eq(commentsTable.postId, postId))
    .orderBy(desc(commentsTable.createdAt))
    .limit(limit).offset(offset);

  const summaries = await getUserSummaries([...new Set(comments.map(c => c.authorId))], viewerId);
  res.json(comments.map(c => ({ ...c, author: summaries[c.authorId] ?? null })));
});

router.post("/posts/:postId/comments", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post ID" }); return; }

  const authorId = (req as any).user.id as number;
  const isAdmin = (req as any).user?.isAdmin === true;

  const post = await assertPostVisible(postId, authorId, isAdmin, res);
  if (!post) return;

  const parsed = CreateCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { content, parentCommentId } = parsed.data as { content: string; parentCommentId?: number | null };

  const [comment] = await db.insert(commentsTable).values({
    postId,
    authorId,
    content,
    parentCommentId: parentCommentId ?? null,
  }).returning();

  await db.update(postsTable).set({ commentsCount: sql`${postsTable.commentsCount} + 1` }).where(eq(postsTable.id, postId));

  const summaries = await getUserSummaries([authorId]);
  const actor = summaries[authorId];

  // notify post author on new comment (skip self-comments)
  if (post.authorId !== authorId) {
    await db.insert(notificationsTable).values({
      userId: post.authorId,
      type: "comment",
      message: `${actor?.displayName ?? "Someone"} commented on your post`,
      actorId: authorId,
      relatedId: postId,
    });
  }

  // notify parent comment author on reply (skip self-replies, skip if same as post author — already notified above)
  if (parentCommentId) {
    const [parentComment] = await db
      .select({ authorId: commentsTable.authorId })
      .from(commentsTable)
      .where(eq(commentsTable.id, parentCommentId))
      .limit(1);

    if (
      parentComment &&
      parentComment.authorId !== authorId &&
      parentComment.authorId !== post.authorId
    ) {
      await db.insert(notificationsTable).values({
        userId: parentComment.authorId,
        type: "comment_reply",
        message: `${actor?.displayName ?? "Someone"} replied to your comment`,
        actorId: authorId,
        relatedId: postId,
      });
    }
  }

  res.status(201).json({ ...comment, author: summaries[authorId] ?? null });
});

router.delete("/comments/:commentId", requireAuth, async (req, res) => {
  const commentId = parseInt(req.params.commentId as string);
  const userId = (req as any).user.id;

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId)).limit(1);
  if (!comment) { res.status(404).json({ error: "Not found" }); return; }
  if (comment.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  await db.update(postsTable).set({ commentsCount: sql`GREATEST(${postsTable.commentsCount} - 1, 0)` }).where(eq(postsTable.id, comment.postId));
  res.json({ ok: true });
});

export default router;
