import { Router, type IRouter } from "express";
import { db, bookmarksTable, postsTable, likesTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray, ne } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { ratingFilter } from "../lib/contentRatingFilter";

const router: IRouter = Router();

router.get("/bookmarks", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const bookmarks = await db.select({ postId: bookmarksTable.postId })
    .from(bookmarksTable)
    .where(eq(bookmarksTable.userId, userId))
    .orderBy(desc(bookmarksTable.createdAt))
    .limit(limit).offset(offset);

  if (bookmarks.length === 0) { res.json([]); return; }

  const postIds = bookmarks.map(b => b.postId);
  const viewerUser = (req as any).user;
  const ratFilter = ratingFilter(viewerUser?.nsfwFilter, viewerUser?.verificationMethod);
  const bookmarksWhere = and(
    inArray(postsTable.id, postIds) as SQL,
    ratFilter,
    ne(postsTable.scanStatus, 'blocked'),
  );
  const posts = await db.select().from(postsTable).where(bookmarksWhere);

  const authorIds = [...new Set(posts.map(p => p.authorId))];
  const summaries = await getUserSummaries(authorIds, userId);

  const liked = await db.select().from(likesTable)
    .where(and(eq(likesTable.userId, userId), inArray(likesTable.postId, postIds)));
  const likedSet = new Set(liked.map(l => l.postId));
  const bookmarkedSet = new Set(postIds);

  // Return in bookmark order
  const postMap = new Map(posts.map(p => [p.id, p]));
  const enriched = postIds
    .map(id => postMap.get(id))
    .filter(Boolean)
    .map(p => ({
      ...p!,
      author: summaries[p!.authorId] ?? null,
      isLiked: likedSet.has(p!.id),
      isBookmarked: bookmarkedSet.has(p!.id),
      hashtags: p!.hashtags ?? [],
    }));

  res.json(enriched);
});

router.post("/posts/:postId/bookmark", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;
  try {
    await db.insert(bookmarksTable).values({ userId, postId });
  } catch { /* already bookmarked */ }
  res.json({ ok: true });
});

router.delete("/posts/:postId/bookmark", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;
  await db.delete(bookmarksTable)
    .where(and(eq(bookmarksTable.userId, userId), eq(bookmarksTable.postId, postId)));
  res.json({ ok: true });
});

export default router;
