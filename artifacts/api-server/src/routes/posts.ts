import { Router, type IRouter } from "express";
import { db, postsTable, likesTable, usersTable, followsTable, subscriptionsTable, notificationsTable, bookmarksTable, reactionsTable, reportsTable, postUnlocksTable, muxPendingUploadsTable } from "@workspace/db";
import { eq, desc, sql, and, inArray, or, ne, gte, SQL } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { CreatePostBody, UpdatePostBody, ListPostsQueryParams, GetFeedQueryParams, GetTrendingPostsQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";
import { createLimiter } from "../middlewares/rateLimiter";
import { getDailyPostLimit } from "../lib/fees";
import { deleteR2Object, r2KeyExtract, isValidR2MediaUrl, getR2ObjectSize, serveMediaUrl } from "../lib/r2";
import { scanAsset } from "../lib/csam";
import { deleteMuxAsset } from "../lib/mux";
import { ratingFilter, canViewRating } from "../lib/contentRatingFilter";
import { logIpEvent } from "../lib/ipEvents";

const router: IRouter = Router();

async function enrichPosts(posts: any[], viewerId?: number, opts: { bypassScanFilter?: boolean } = {}) {
  // Approve-then-remove: pending + clean posts are public immediately.
  // Only blocked posts (flagged by CSAM scanner) are hidden.
  // bypassScanFilter=true is for mutation responses where the caller is the owner.
  if (!opts.bypassScanFilter) {
    posts = posts.filter(p => p.scanStatus !== 'blocked');
  }
  if (posts.length === 0) return [];
  const authorIds = [...new Set(posts.map(p => p.authorId))];
  const summaries = await getUserSummaries(authorIds, viewerId);

  let likedSet = new Set<number>();
  let bookmarkedSet = new Set<number>();
  let unlockedSet = new Set<number>();
  if (viewerId) {
    const postIds = posts.map(p => p.id);
    const liked = await db.select().from(likesTable).where(
      and(eq(likesTable.userId, viewerId), inArray(likesTable.postId, postIds))
    );
    liked.forEach(l => likedSet.add(l.postId));

    const bookmarked = await db.select().from(bookmarksTable).where(
      and(eq(bookmarksTable.userId, viewerId), inArray(bookmarksTable.postId, postIds))
    );
    bookmarked.forEach(b => bookmarkedSet.add(b.postId));

    const unlocked = await db.select({ postId: postUnlocksTable.postId })
      .from(postUnlocksTable)
      .where(and(eq(postUnlocksTable.userId, viewerId), inArray(postUnlocksTable.postId, postIds)));
    unlocked.forEach(u => unlockedSet.add(u.postId));
  }

  return Promise.all(posts.map(async p => {
    const isPaidContent = p.price !== null && p.price !== undefined && Number(p.price) > 0;
    const isAuthor = viewerId !== undefined && viewerId === p.authorId;
    const hasMediaAccess = !isPaidContent || isAuthor || unlockedSet.has(p.id);
    // Serve media for all non-blocked posts (approve-then-remove model).
    const canServeMedia = p.scanStatus !== 'blocked';
    return {
      ...p,
      price: p.price !== null && p.price !== undefined ? Number(p.price) : null,
      downloadPrice: p.downloadPrice !== null && p.downloadPrice !== undefined ? Number(p.downloadPrice) : null,
      trimStart: p.trimStart !== null && p.trimStart !== undefined ? Number(p.trimStart) : null,
      trimEnd: p.trimEnd !== null && p.trimEnd !== undefined ? Number(p.trimEnd) : null,
      mediaUrl: hasMediaAccess && canServeMedia ? await serveMediaUrl(p.mediaUrl) : null,
      muxPlaybackId: hasMediaAccess && canServeMedia ? (p.muxPlaybackId ?? null) : null,
      thumbnailUrl: hasMediaAccess && canServeMedia ? await serveMediaUrl(p.thumbnailUrl) : null,
      embedUrl: hasMediaAccess && canServeMedia ? await serveMediaUrl(p.embedUrl) : null,
      mediaItems: hasMediaAccess && canServeMedia && p.mediaItems
        ? await Promise.all(p.mediaItems.map((u: string) => serveMediaUrl(u)))
        : null,
      author: summaries[p.authorId] ?? null,
      isLiked: likedSet.has(p.id),
      isBookmarked: bookmarkedSet.has(p.id),
      isUnlocked: unlockedSet.has(p.id),
      hashtags: p.hashtags ?? [],
    };
  }));
}

router.get("/posts", optionalAuth, async (req, res) => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  const { type, hashtag, limit = 20, offset = 0 } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

  const viewerUser = (req as any).user;
  const viewerId = (req as any).userId as number | undefined;
  const isAdmin = viewerUser?.isAdmin === true;

  let userNsfwFilter: string | null = null;
  if (viewerId) {
    userNsfwFilter = viewerUser?.nsfwFilter ?? "blur";
  }

  // Admins see all posts regardless of visibility or content rating
  const visFilter = isAdmin
    ? undefined
    : viewerId
      ? or(eq(postsTable.visibility, "public"), eq(postsTable.authorId, viewerId))!
      : eq(postsTable.visibility, "public");
  const ratFilter = isAdmin ? undefined : ratingFilter(userNsfwFilter, viewerUser?.verificationMethod);
  // Approve-then-remove: hide only blocked posts; pending shows immediately.
  const scanFilter = isAdmin ? undefined : ne(postsTable.scanStatus, 'blocked');
  const baseFilter = and(visFilter, ratFilter, scanFilter);

  let query = db.select().from(postsTable).$dynamic().where(baseFilter);

  if (type && type !== "all") {
    query = query.where(and(baseFilter, eq(postsTable.type, type)));
  }

  const posts = await query.orderBy(desc(postsTable.createdAt)).limit(limit).offset(offset);
  const filtered = hashtag ? posts.filter(p => p.hashtags?.includes(hashtag)) : posts;
  res.json(await enrichPosts(filtered, viewerId));
});

router.get("/posts/feed", requireAuth, async (req, res) => {
  const parsed = GetFeedQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};
  const tab: string = (req.query.tab as string) ?? "foryou";
  const userId = (req as any).user.id;

  const isAdmin = (req as any).user?.isAdmin === true;

  const followRows = await db.select({ followingId: followsTable.followingId })
    .from(followsTable).where(eq(followsTable.followerId, userId));
  const followingIds = followRows.map(f => f.followingId);
  const followingSet = new Set(followingIds);

  // Fetch viewer preferences (interests + nsfwFilter) in one query
  const [userRow] = await db.select({ interests: usersTable.interests, nsfwFilter: usersTable.nsfwFilter, verificationMethod: usersTable.verificationMethod })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const interestSet = new Set<string>((userRow?.interests ?? []).map((s: string) => s.toLowerCase()));
  const hasInterests = interestSet.size > 0;

  // Admins see all posts; others get visibility + rating filter
  // Approve-then-remove: only blocked posts are hidden; pending shows immediately.
  const feedVisFilter = or(eq(postsTable.visibility, "public"), eq(postsTable.authorId, userId))!;
  const ratFilter = isAdmin ? undefined : ratingFilter(userRow?.nsfwFilter ?? "blur", userRow?.verificationMethod);
  const scanFilter = isAdmin ? undefined : ne(postsTable.scanStatus, 'blocked');
  const feedFilter = isAdmin ? undefined : and(feedVisFilter, ratFilter, scanFilter);

  if (tab === "following") {
    const rawPosts = followingIds.length > 0
      ? await db.select().from(postsTable)
          .where(and(inArray(postsTable.authorId, followingIds), feedFilter))
          .orderBy(desc(postsTable.isPinned), desc(postsTable.createdAt)).limit(limit).offset(offset)
      : [];
    res.json({ posts: await enrichPosts(rawPosts, userId), personalised: false });
    return;
  }

  if (tab === "hot") {
    const rawPosts = await db.select().from(postsTable)
      .where(feedFilter)
      .orderBy(desc(postsTable.isPinned), desc(sql`${postsTable.likesCount} + ${postsTable.commentsCount} * 2 + ${postsTable.viewsCount} * 0.1`))
      .limit(limit).offset(offset);
    res.json({ posts: await enrichPosts(rawPosts, userId), personalised: false });
    return;
  }

  // "new" — strictly newest first
  const rawPosts = await db.select().from(postsTable)
    .where(feedFilter)
    .orderBy(desc(postsTable.isPinned), desc(postsTable.createdAt))
    .limit(limit).offset(offset);
  res.json({ posts: await enrichPosts(rawPosts, userId), personalised: false });
});

router.get("/posts/trending", optionalAuth, async (req, res) => {
  const parsed = GetTrendingPostsQueryParams.safeParse(req.query);
  const { limit = 20 } = parsed.success ? parsed.data : {};
  const sort: string = (req.query.sort as string) ?? "new";
  const viewerUser = (req as any).user;
  const viewerId = (req as any).userId as number | undefined;
  const isAdmin = viewerUser?.isAdmin === true;

  let userNsfwFilter: string | null = null;
  if (viewerId) {
    userNsfwFilter = viewerUser?.nsfwFilter ?? "blur";
  }

  const ratFilter = isAdmin ? undefined : ratingFilter(userNsfwFilter, viewerUser?.verificationMethod);
  const scanFilter = isAdmin ? undefined : ne(postsTable.scanStatus, 'blocked');
  const trendingFilter = isAdmin
    ? undefined
    : and(eq(postsTable.visibility, "public"), ratFilter, scanFilter);

  const orderCol = sort === "hot"
    ? desc(sql`${postsTable.likesCount} + ${postsTable.commentsCount} * 2 + ${postsTable.viewsCount} * 0.1`)
    : desc(postsTable.createdAt);

  const posts = await db.select().from(postsTable)
    .where(trendingFilter)
    .orderBy(desc(postsTable.isPinned), orderCol)
    .limit(limit);

  res.json(await enrichPosts(posts, viewerId));
});

router.post("/posts", requireAuth, createLimiter, async (req, res) => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.caption && parsed.data.caption.length > 500) {
    res.status(400).json({ error: "Caption must be 500 characters or less" }); return;
  }

  if (parsed.data.mediaUrl && !isValidR2MediaUrl(parsed.data.mediaUrl)) {
    res.status(400).json({ error: "mediaUrl must point to a valid R2 media object" }); return;
  }
  if (parsed.data.thumbnailUrl && !isValidR2MediaUrl(parsed.data.thumbnailUrl)) {
    res.status(400).json({ error: "thumbnailUrl must point to a valid R2 media object" }); return;
  }
  if (parsed.data.mediaItems?.length) {
    for (const url of parsed.data.mediaItems) {
      if (!isValidR2MediaUrl(url)) {
        res.status(400).json({ error: "All mediaItems must point to valid R2 media objects" }); return;
      }
    }
  }

  const user = (req as any).user;
  const authorId = user.id;

  // Audit log — helps diagnose "post under wrong account" reports.
  req.log.info({ authorId, username: user.username, type: parsed.data.type }, "creating post");

  // Enforce daily post limit for free tier (admins bypass)
  if (!user.isAdmin) {
    const dailyLimit = getDailyPostLimit(user.accountTier);
    if (dailyLimit !== null) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(postsTable)
        .where(and(eq(postsTable.authorId, authorId), gte(postsTable.createdAt, startOfDay)));
      if (count >= dailyLimit) {
        res.status(429).json({
          error: `Free accounts are limited to ${dailyLimit} posts per day. Upgrade to Creator or higher for unlimited posts.`,
          dailyLimitReached: true,
          limit: dailyLimit,
        });
        return;
      }
    }
  }

  // Strip non-column fields (pricing, mux upload id, legacy attestation fields) from restData.
  const { price, downloadPrice, trimStart, trimEnd, muxUploadId, consentToPublish, allDepictedConsented, allDepicted18Plus, depictsOthers, electronicSignature, ...restData } = parsed.data;
  const { linkPreview: rawLinkPreview, ...restDataNoLink } = restData;
  const hasMedia = !!(restDataNoLink.mediaUrl || restDataNoLink.thumbnailUrl || restDataNoLink.muxAssetId || (restDataNoLink.mediaItems && restDataNoLink.mediaItems.length > 0));
  const linkPreview = rawLinkPreview ? {
    title: rawLinkPreview.title,
    description: rawLinkPreview.description ?? null,
    image: rawLinkPreview.image ?? null,
    domain: rawLinkPreview.domain,
    url: rawLinkPreview.url,
  } : undefined;

  const [post] = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(postsTable).values({
      ...restDataNoLink,
      authorId,
      contentRating: "safe",
      hashtags: parsed.data.hashtags ?? [],
      scanStatus: hasMedia ? 'pending' : 'clean',
      ...(linkPreview ? { linkPreview } : {}),
      ...(price !== undefined && price !== null ? { price: String(price) } : {}),
      ...(downloadPrice !== undefined && downloadPrice !== null ? { downloadPrice: String(downloadPrice) } : {}),
      ...(trimStart !== undefined && trimStart !== null ? { trimStart: String(trimStart) } : {}),
      ...(trimEnd !== undefined && trimEnd !== null ? { trimEnd: String(trimEnd) } : {}),
    }).returning();

    return [inserted];
  });

  await db.update(usersTable).set({ postsCount: sql`${usersTable.postsCount} + 1` }).where(eq(usersTable.id, authorId));

  logIpEvent(authorId, req.ip, "post_create");

  if (hasMedia) {
    void scanAsset(post.id, 'post');
  }

  // Remove the pending-upload tracking record so the cleanup job knows this
  // asset is now claimed and should not be deleted.
  // Delete by muxAssetId (reliable when the post has it) AND by uploadId
  // (belt-and-suspenders: uploadId is always present and removes the record
  // even if muxAssetId was somehow missing on the pending row).
  if (post.muxAssetId) {
    await db
      .delete(muxPendingUploadsTable)
      .where(eq(muxPendingUploadsTable.muxAssetId, post.muxAssetId));
  }
  if (muxUploadId) {
    await db
      .delete(muxPendingUploadsTable)
      .where(eq(muxPendingUploadsTable.uploadId, muxUploadId));
  }

  const summaries = await getUserSummaries([authorId]);
  res.status(201).json({ ...post, author: summaries[authorId], isLiked: false, hashtags: post.hashtags ?? [] });
});

router.get("/posts/:postId", optionalAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }

  const viewerId = (req as any).userId as number | undefined;
  const isAdmin = (req as any).user?.isAdmin === true;

  const [post] = await db.select().from(postsTable)
    .where(and(
      eq(postsTable.id, postId),
      isAdmin ? undefined : ne(postsTable.scanStatus, 'blocked'),
    ))
    .limit(1);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  // Admins bypass all visibility and rating checks; authors always see their own posts
  if (!isAdmin && post.authorId !== viewerId) {
    // Rating gate — must pass before visibility to avoid leaking existence of gated posts
    const viewerUser = (req as any).user;
    const nsfwFilter = viewerId ? (viewerUser?.nsfwFilter ?? "blur") : null;
    const verificationMethod = viewerId ? (viewerUser?.verificationMethod ?? null) : null;
    if (!canViewRating(post.contentRating, nsfwFilter, verificationMethod)) {
      res.status(404).json({ error: "Post not found" }); return;
    }

    if (post.visibility === "private") {
      res.status(404).json({ error: "Post not found" }); return;
    }
    if (post.visibility === "followers" || post.visibility === "subscribers_only") {
      if (!viewerId) { res.status(404).json({ error: "Post not found" }); return; }
      if (post.visibility === "followers") {
        const [follow] = await db.select({ id: followsTable.id })
          .from(followsTable)
          .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, post.authorId)))
          .limit(1);
        if (!follow) { res.status(404).json({ error: "Post not found" }); return; }
      } else {
        // subscribers_only — active OR cancelled but still within paid period
        const now = new Date();
        const [sub] = await db.select({ id: subscriptionsTable.id })
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
        if (!sub) { res.status(404).json({ error: "Post not found" }); return; }
      }
    }
  }

  await db.update(postsTable).set({ viewsCount: sql`${postsTable.viewsCount} + 1` }).where(eq(postsTable.id, postId));
  const [enriched] = await enrichPosts([post], viewerId);
  res.json(enriched);
});

router.patch("/posts/:postId", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  if (post.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.mediaUrl && !isValidR2MediaUrl(parsed.data.mediaUrl)) {
    res.status(400).json({ error: "mediaUrl must point to a valid R2 media object" }); return;
  }
  if (parsed.data.thumbnailUrl && !isValidR2MediaUrl(parsed.data.thumbnailUrl)) {
    res.status(400).json({ error: "thumbnailUrl must point to a valid R2 media object" }); return;
  }

  const oldMediaUrl = post.mediaUrl;
  const oldThumbnailUrl = post.thumbnailUrl;

  const { muxUploadId, ...updateData } = parsed.data;

  // Re-quarantine if any media field is being changed
  const POST_MEDIA_FIELDS = ['mediaUrl', 'thumbnailUrl', 'muxAssetId', 'mediaItems'] as const;
  const touchesMedia = POST_MEDIA_FIELDS.some(f => f in updateData);
  if (touchesMedia) {
    const resultMediaUrl = 'mediaUrl' in updateData ? updateData.mediaUrl : post.mediaUrl;
    const resultThumb = 'thumbnailUrl' in updateData ? updateData.thumbnailUrl : post.thumbnailUrl;
    const resultMuxId = 'muxAssetId' in updateData ? updateData.muxAssetId : post.muxAssetId;
    const resultMediaItems = ('mediaItems' in updateData) ? (updateData as any).mediaItems : post.mediaItems;
    const resultHasMedia = !!(resultMediaUrl || resultThumb || resultMuxId || (resultMediaItems && resultMediaItems.length > 0));
    (updateData as any).scanStatus = resultHasMedia ? 'pending' : 'clean';
  }

  const [updated] = await db.update(postsTable).set(updateData).where(eq(postsTable.id, postId)).returning();

  // Remove the pending-upload tracking record so the cleanup job knows this
  // asset is now claimed and should not be deleted.
  // Delete by muxAssetId (reliable when present) AND by uploadId
  // (belt-and-suspenders: uploadId is always present and removes the record
  // even if muxAssetId was somehow missing on the pending row).
  if (updateData.muxAssetId) {
    await db
      .delete(muxPendingUploadsTable)
      .where(eq(muxPendingUploadsTable.muxAssetId, updateData.muxAssetId));
  }
  if (muxUploadId) {
    await db
      .delete(muxPendingUploadsTable)
      .where(eq(muxPendingUploadsTable.uploadId, muxUploadId));
  }

  // Fire-and-forget: clean up replaced media objects from R2
  if (parsed.data.mediaUrl !== undefined && parsed.data.mediaUrl !== oldMediaUrl && oldMediaUrl) {
    const ref = r2KeyExtract(oldMediaUrl);
    if (ref) void deleteR2Object(ref.bucket, ref.key);
  }
  if (parsed.data.thumbnailUrl !== undefined && parsed.data.thumbnailUrl !== oldThumbnailUrl && oldThumbnailUrl) {
    const ref = r2KeyExtract(oldThumbnailUrl);
    if (ref) void deleteR2Object(ref.bucket, ref.key);
  }

  if (touchesMedia && updated.scanStatus === 'pending') {
    void scanAsset(updated.id, 'post');
  }

  // Use bypassScanFilter so the owner always gets their updated post back —
  // even when it's re-quarantined to 'pending'. Media fields are individually
  // gated inside enrichPosts via p.scanStatus === 'clean', so no raw media
  // leaks out for unscanned content.
  const [enriched] = await enrichPosts([updated], userId, { bypassScanFilter: true });
  res.json(enriched);
});

router.delete("/posts/:postId", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  if (post.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(postsTable).where(eq(postsTable.id, postId));
  await db.update(usersTable).set({ postsCount: sql`GREATEST(${usersTable.postsCount} - 1, 0)` }).where(eq(usersTable.id, userId));

  // Gather R2 refs for media and thumbnail
  const mediaRef = post.mediaUrl ? r2KeyExtract(post.mediaUrl) : null;
  const thumbRef = post.thumbnailUrl ? r2KeyExtract(post.thumbnailUrl) : null;

  // HEAD objects to retrieve their sizes, then fire-and-forget the actual deletes
  const [mediaBytes, thumbBytes] = await Promise.all([
    mediaRef ? getR2ObjectSize(mediaRef.bucket, mediaRef.key) : Promise.resolve(0),
    thumbRef ? getR2ObjectSize(thumbRef.bucket, thumbRef.key) : Promise.resolve(0),
  ]);
  if (mediaRef) void deleteR2Object(mediaRef.bucket, mediaRef.key);
  if (thumbRef) void deleteR2Object(thumbRef.bucket, thumbRef.key);

  // Decrement storage counter by the recovered bytes
  const freedBytes = mediaBytes + thumbBytes;
  if (freedBytes > 0) {
    await db.update(usersTable)
      .set({ storageUsedBytes: sql`GREATEST(${usersTable.storageUsedBytes} - ${freedBytes}, 0)` })
      .where(eq(usersTable.id, userId));
  }

  // Await deletion of Mux asset — errors are logged inside deleteMuxAsset
  if (post.muxAssetId) {
    await deleteMuxAsset(post.muxAssetId);
  }

  res.json({ ok: true });
});

router.post("/posts/:postId/like", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;

  try {
    await db.insert(likesTable).values({ userId, postId });
    await db.update(postsTable).set({ likesCount: sql`${postsTable.likesCount} + 1` }).where(eq(postsTable.id, postId));

    // notify post author (skip self-likes)
    const [post] = await db.select({ authorId: postsTable.authorId }).from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (post && post.authorId !== userId) {
      const summaries = await getUserSummaries([userId]);
      const actor = summaries[userId];
      await db.insert(notificationsTable).values({
        userId: post.authorId,
        type: "like",
        message: `${actor?.displayName ?? "Someone"} liked your post`,
        actorId: userId,
        relatedId: postId,
      });
    }
  } catch { /* already liked */ }
  res.json({ ok: true });
});

router.delete("/posts/:postId/like", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;

  const deleted = await db.delete(likesTable)
    .where(and(eq(likesTable.userId, userId), eq(likesTable.postId, postId))).returning();

  if (deleted.length > 0) {
    await db.update(postsTable).set({ likesCount: sql`GREATEST(${postsTable.likesCount} - 1, 0)` }).where(eq(postsTable.id, postId));
  }
  res.json({ ok: true });
});

router.get("/posts/:postId/reactions", optionalAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const viewerId = (req as any).userId;

  const rows = await db.select().from(reactionsTable).where(eq(reactionsTable.postId, postId));

  const counts: Record<string, number> = {};
  const userReactions: string[] = [];

  for (const row of rows) {
    counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
    if (viewerId && row.userId === viewerId) userReactions.push(row.emoji);
  }

  res.json({ counts, userReactions });
});

router.post("/posts/:postId/reactions", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;
  const { emoji } = req.body as { emoji?: string };

  if (!emoji || typeof emoji !== "string" || emoji.length > 10) {
    res.status(400).json({ error: "Invalid emoji" }); return;
  }
  try {
    await db.insert(reactionsTable).values({ userId, postId, emoji });
  } catch { /* duplicate */ }
  res.json({ ok: true });
});

router.delete("/posts/:postId/reactions/:emoji", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  const userId = (req as any).user.id;
  const emoji = decodeURIComponent(req.params.emoji as string);

  await db.delete(reactionsTable)
    .where(and(eq(reactionsTable.userId, userId), eq(reactionsTable.postId, postId), eq(reactionsTable.emoji, emoji)));
  res.json({ ok: true });
});

router.post("/posts/:postId/report", requireAuth, async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid postId" }); return; }
  const userId = (req as any).user.id as number;
  const { reason, note } = req.body as { reason?: string; note?: string };

  // Map legacy reason values to the canonical enum
  const REASON_MAP: Record<string, string> = {
    spam: "spam", harassment: "harassment", hate_speech: "harassment",
    illegal_content: "other", nsfw_unlabeled: "other", violence: "violence",
    exploitation: "non_consensual", non_consensual: "non_consensual",
    underage_csam: "underage_csam", other: "other",
  };
  const canonicalReason = reason ? (REASON_MAP[reason] ?? "other") : null;
  if (!canonicalReason) { res.status(400).json({ error: "reason is required" }); return; }

  // Dedup: one open report per (reporter, contentType, contentId)
  const [existing] = await db.select({ id: reportsTable.id }).from(reportsTable)
    .where(and(eq(reportsTable.reporterId, userId), eq(reportsTable.contentType, "post"), eq(reportsTable.contentId, String(postId)), eq(reportsTable.status, "open")))
    .limit(1);
  if (existing) { res.json({ ok: true }); return; }

  await db.insert(reportsTable).values({
    reporterId: userId, contentType: "post", contentId: String(postId),
    reason: canonicalReason, note: note ?? null, status: "open",
  });
  res.json({ ok: true });
});

export default router;
