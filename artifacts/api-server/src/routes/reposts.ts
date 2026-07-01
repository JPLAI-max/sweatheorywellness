import { Router, type IRouter } from "express";
import { db, repostsTable, postsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { canViewPost } from "../lib/helpers";
import { serveMediaUrl } from "../lib/r2";

const router: IRouter = Router();

router.post("/posts/:postId/repost", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post ID" }); return; }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const allowed = await canViewPost(post, user.id, user.isAdmin === true);
  if (!allowed) { res.status(404).json({ error: "Post not found" }); return; }

  if (post.authorId === user.id) { res.status(400).json({ error: "You can't repost your own post" }); return; }

  // Only public posts may be reposted — reposts are visible to everyone, which
  // would bypass follower-only / subscriber-only / private visibility controls.
  // Return 404 (not 403) to avoid leaking the existence of restricted posts via
  // ID enumeration (consistent with how posts.ts handles visibility denials).
  if (post.visibility !== "public") {
    res.status(404).json({ error: "Post not found" }); return;
  }

  const [existing] = await db.select().from(repostsTable)
    .where(and(eq(repostsTable.reposterId, user.id), eq(repostsTable.originalPostId, postId)))
    .limit(1);
  if (existing) { res.status(409).json({ error: "Already reposted" }); return; }

  await db.insert(repostsTable).values({
    reposterId: user.id,
    originalPostId: postId,
    originalAuthorId: post.authorId,
  });

  await db.update(postsTable)
    .set({ repostsCount: sql`${postsTable.repostsCount} + 1` })
    .where(eq(postsTable.id, postId));

  await db.insert(notificationsTable).values({
    userId: post.authorId,
    actorId: user.id,
    type: "repost",
    postId,
  } as any).onConflictDoNothing();

  const [updated] = await db.select({ repostsCount: postsTable.repostsCount })
    .from(postsTable).where(eq(postsTable.id, postId)).limit(1);

  req.log.info({ userId: user.id, postId }, "Post reposted");
  res.json({ ok: true, repostsCount: updated?.repostsCount ?? 0 });
});

router.delete("/posts/:postId/repost", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post ID" }); return; }

  const [existing] = await db.select().from(repostsTable)
    .where(and(eq(repostsTable.reposterId, user.id), eq(repostsTable.originalPostId, postId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Repost not found" }); return; }

  await db.delete(repostsTable)
    .where(and(eq(repostsTable.reposterId, user.id), eq(repostsTable.originalPostId, postId)));

  await db.update(postsTable)
    .set({ repostsCount: sql`GREATEST(${postsTable.repostsCount} - 1, 0)` })
    .where(eq(postsTable.id, postId));

  const [updated] = await db.select({ repostsCount: postsTable.repostsCount })
    .from(postsTable).where(eq(postsTable.id, postId)).limit(1);

  req.log.info({ userId: user.id, postId }, "Repost removed");
  res.json({ ok: true, repostsCount: updated?.repostsCount ?? 0 });
});

router.get("/posts/:postId/repost-status", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post ID" }); return; }

  const [existing] = await db.select().from(repostsTable)
    .where(and(eq(repostsTable.reposterId, user.id), eq(repostsTable.originalPostId, postId)))
    .limit(1);

  res.json({ isReposted: !!existing });
});

router.get("/users/:userId/reposts", optionalAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  // Only return public posts — reposts are a public action and the listing has
  // no per-caller visibility resolution, so non-public posts must be excluded
  // to prevent confidential content from leaking through a reposter's profile.
  const rows = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      type: postsTable.type,
      caption: postsTable.caption,
      mediaUrl: postsTable.mediaUrl,
      thumbnailUrl: postsTable.thumbnailUrl,
      muxPlaybackId: postsTable.muxPlaybackId,
      scanStatus: postsTable.scanStatus,
      hashtags: postsTable.hashtags,
      likesCount: postsTable.likesCount,
      commentsCount: postsTable.commentsCount,
      viewsCount: postsTable.viewsCount,
      repostsCount: postsTable.repostsCount,
      contentRating: postsTable.contentRating,
      visibility: postsTable.visibility,
      createdAt: postsTable.createdAt,
      repostedAt: repostsTable.createdAt,
      reposterUsername: usersTable.username,
      reposterDisplayName: usersTable.displayName,
      reposterAvatarUrl: usersTable.avatarUrl,
    })
    .from(repostsTable)
    .innerJoin(postsTable, eq(repostsTable.originalPostId, postsTable.id))
    .innerJoin(usersTable, eq(repostsTable.reposterId, usersTable.id))
    .where(and(
      eq(repostsTable.reposterId, userId),
      eq(postsTable.visibility, "public"),
    ))
    .orderBy(sql`${repostsTable.createdAt} DESC`)
    .limit(20);

  // Approve-then-remove: serve media for clean + pending; withhold only for blocked.
  const safeRows = await Promise.all(rows.map(async row => {
    const canServe = row.scanStatus !== 'blocked';
    return {
      ...row,
      mediaUrl: canServe ? await serveMediaUrl(row.mediaUrl) : null,
      thumbnailUrl: canServe ? await serveMediaUrl(row.thumbnailUrl) : null,
      muxPlaybackId: canServe ? row.muxPlaybackId : null,
    };
  }));

  res.json(safeRows);
});

export default router;
