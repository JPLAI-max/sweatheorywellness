import { Router, type IRouter } from "express";
import { db, postsTable, usersTable } from "@workspace/db";
import { sql, desc, ilike, or, and } from "drizzle-orm";
import { optionalAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { ratingFilter } from "../lib/contentRatingFilter";

const router: IRouter = Router();

router.get("/hashtags/trending", async (_req, res) => {
  // Unnest all hashtags and count occurrences
  const result = await db.execute(sql`
    SELECT tag, count(*) as posts_count
    FROM (
      SELECT unnest(hashtags) as tag
      FROM posts
      WHERE created_at > NOW() - INTERVAL '7 days'
    ) t
    GROUP BY tag
    ORDER BY posts_count DESC
    LIMIT 10
  `);

  res.json((result.rows as any[]).map(r => ({
    name: r.tag,
    postsCount: Number(r.posts_count),
    trendingScore: Number(r.posts_count),
  })));
});

router.get("/search", optionalAuth, async (req, res) => {
  const q = req.query.q as string;
  const type = (req.query.type as string) ?? "all";

  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const viewerUser = (req as any).user;
  const viewerId = (req as any).userId;
  let posts: any[] = [];
  let users: any[] = [];

  if (type === "all" || type === "posts") {
    const ratFilter = ratingFilter(viewerUser?.nsfwFilter, viewerUser?.verificationMethod);
    const searchWhere = ratFilter
      ? and(ilike(postsTable.caption, `%${q}%`), ratFilter)!
      : ilike(postsTable.caption, `%${q}%`);
    posts = await db.select().from(postsTable)
      .where(searchWhere)
      .orderBy(desc(postsTable.createdAt))
      .limit(20);

    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const summaries = await getUserSummaries(authorIds, viewerId);
    posts = posts.map(p => ({ ...p, author: summaries[p.authorId] ?? null, isLiked: false, hashtags: p.hashtags ?? [] }));
  }

  if (type === "all" || type === "users") {
    const userRows = await db.select().from(usersTable)
      .where(or(ilike(usersTable.username, `%${q}%`), ilike(usersTable.displayName, `%${q}%`)))
      .limit(20);
    const summaries = await getUserSummaries(userRows.map(u => u.id), viewerId);
    users = userRows.map(u => summaries[u.id]).filter(Boolean);
  }

  res.json({ posts, users });
});

export default router;
