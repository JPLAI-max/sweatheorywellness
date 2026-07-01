import { Router, type IRouter } from "express";
import { db, usersTable, followsTable, postsTable, likesTable, streamsTable, notificationsTable, subscriptionsTable } from "@workspace/db";
import { eq, ilike, sql, and, desc, notInArray, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { UpdateUserBody, SearchUsersQueryParams, GetUserPostsQueryParams, GetFollowersQueryParams, GetFollowingQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";
import { ratingFilter } from "../lib/contentRatingFilter";
import { sendNewFollowerEmail } from "../lib/email";
import { deleteR2Object, r2KeyExtract, getR2ObjectSize, serveMediaUrl, isValidR2MediaUrl } from "../lib/r2";
import { scanAsset } from "../lib/csam";

const router: IRouter = Router();

router.get("/users/suggestions", optionalAuth, async (req, res) => {
  const userId = (req as any).userId as number | undefined;
  const limit = parseInt(req.query.limit as string) || 5;

  let suggested;
  if (userId) {
    const following = await db.select({ followingId: followsTable.followingId })
      .from(followsTable).where(eq(followsTable.followerId, userId));
    const followingIds = following.map(f => f.followingId);
    const excludeIds = [...followingIds, userId];
    suggested = await db.select().from(usersTable)
      .where(notInArray(usersTable.id, excludeIds))
      .orderBy(desc(usersTable.isFeatured), desc(usersTable.followersCount))
      .limit(limit);
  } else {
    suggested = await db.select().from(usersTable)
      .orderBy(desc(usersTable.isFeatured), desc(usersTable.followersCount))
      .limit(limit);
  }

  const summaries = await getUserSummaries(suggested.map(u => u.id), userId);
  res.json(suggested.map(u => summaries[u.id]).filter(Boolean));
});

router.get("/users", optionalAuth, async (req, res) => {
  const parsed = SearchUsersQueryParams.safeParse(req.query);
  const { q, limit = 20, offset = 0 } = parsed.success ? parsed.data : { q: undefined, limit: 20, offset: 0 };

  const query = db.select().from(usersTable);
  const users = q
    ? await query.where(ilike(usersTable.username, `%${q}%`)).limit(limit).offset(offset)
    : await query.limit(limit).offset(offset);

  const viewerId = (req as any).userId;
  const summaries = await getUserSummaries(users.map(u => u.id), viewerId);
  res.json(users.map(u => summaries[u.id]));
});

router.get("/users/:userId", optionalAuth, async (req, res) => {
  const raw = req.params.userId as string;
  const userId = parseInt(raw);

  let user: typeof usersTable.$inferSelect | undefined;
  if (isNaN(userId)) {
    const [found] = await db.select().from(usersTable).where(eq(usersTable.username, raw as string)).limit(1);
    user = found;
  } else {
    const [found] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    user = found;
  }

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const resolvedId = user.id;
  const viewerId = (req as any).userId;
  let isFollowing = false;
  let isSubscribed = false;
  if (viewerId && viewerId !== resolvedId) {
    const [follow, sub] = await Promise.all([
      db.select({ id: followsTable.followerId }).from(followsTable)
        .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, resolvedId))).limit(1),
      db.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.subscriberId, viewerId), eq(subscriptionsTable.creatorId, resolvedId), eq(subscriptionsTable.status, "active"))).limit(1),
    ]);
    isFollowing = follow.length > 0;
    isSubscribed = sub.length > 0;
  }

  const isOwnProfile = viewerId === resolvedId;

  const [servedAvatarUrl, servedBannerUrl] = await Promise.all([
    user.avatarScanStatus === 'clean' ? serveMediaUrl(user.avatarUrl) : Promise.resolve(null),
    user.bannerScanStatus === 'clean' ? serveMediaUrl(user.bannerUrl) : Promise.resolve(null),
  ]);

  // Fields safe to expose publicly (no PII, no security-sensitive flags)
  const publicProfile = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: servedAvatarUrl,
    bannerUrl: servedBannerUrl,
    isVerified: user.isVerified,
    isPremium: user.isPremium,
    accountTier: user.accountTier,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    postsCount: user.postsCount,
    isNsfwCreator: user.isNsfwCreator,
    nsfwFilter: user.nsfwFilter,
    profileSongUrl: user.profileSongUrl,
    profileSongTitle: user.profileSongTitle,
    profileSongArtist: user.profileSongArtist,
    interests: user.interests,
    subscriptionPrice: user.subscriptionPrice ? Number(user.subscriptionPrice) : null,
    isAgeVerified: user.isAgeVerified,
    avatarColor: user.avatarColor,
    websiteUrl: user.websiteUrl,
    instagramUsername: user.instagramUsername,
    tiktokUsername: user.tiktokUsername,
    onlyfansUrl: user.onlyfansUrl,
    fanslyUrl: user.fanslyUrl,
    createdAt: user.createdAt,
  };

  // Additional fields visible only to the account owner
  const ownerFields = isOwnProfile
    ? {
        email: user.email,
        gender: user.gender,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned,
        storageUsedBytes: user.storageUsedBytes,
        idVerificationStatus: user.idVerificationStatus,
        verificationMethod: user.verificationMethod,
        verificationState: user.verificationState,
        verifiedAt: user.verifiedAt,
        tosAcceptedAt: user.tosAcceptedAt,
        redditId: user.redditId,
        redditUsername: user.redditUsername,
        redditKarma: user.redditKarma,
        xId: user.xId,
        xUsername: user.xUsername,
        xFollowersCount: user.xFollowersCount,
        updatedAt: user.updatedAt,
      }
    : {};

  res.json({
    ...publicProfile,
    ...ownerFields,
    isFollowing,
    isSubscribed,
    isOwnProfile,
  });
});

router.patch("/users/:userId", requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const me = (req as any).user;
  if (me.id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.avatarUrl && !isValidR2MediaUrl(parsed.data.avatarUrl)) { res.status(400).json({ error: "avatarUrl must point to a valid R2 media object" }); return; }
  if (parsed.data.bannerUrl && !isValidR2MediaUrl(parsed.data.bannerUrl)) { res.status(400).json({ error: "bannerUrl must point to a valid R2 media object" }); return; }

  // Fetch current avatar/banner keys before overwriting so we can clean up old files
  const [current] = await db
    .select({ avatarUrl: usersTable.avatarUrl, bannerUrl: usersTable.bannerUrl })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // Augment with scan status for any media field being set
  const updatePayload: any = { ...parsed.data };
  if ('avatarUrl' in parsed.data) {
    updatePayload.avatarScanStatus = parsed.data.avatarUrl ? 'pending' : 'clean';
  }
  if ('bannerUrl' in parsed.data) {
    updatePayload.bannerScanStatus = parsed.data.bannerUrl ? 'pending' : 'clean';
  }

  const [updated] = await db.update(usersTable).set(updatePayload).where(eq(usersTable.id, userId)).returning();
  const { passwordHash: _ph, totpSecret: _ts, passwordResetToken: _prt, passwordResetExpires: _pre, ...safeUser } = updated;

  // Fire-and-forget: delete old R2 objects when avatar or banner is replaced,
  // and decrement storageUsedBytes by the size of the removed files.
  if (current) {
    const avatarRef = (parsed.data.avatarUrl !== undefined && current.avatarUrl && current.avatarUrl !== parsed.data.avatarUrl)
      ? r2KeyExtract(current.avatarUrl)
      : null;
    const bannerRef = (parsed.data.bannerUrl !== undefined && current.bannerUrl && current.bannerUrl !== parsed.data.bannerUrl)
      ? r2KeyExtract(current.bannerUrl)
      : null;

    if (avatarRef || bannerRef) {
      const [avatarBytes, bannerBytes] = await Promise.all([
        avatarRef ? getR2ObjectSize(avatarRef.bucket, avatarRef.key) : Promise.resolve(0),
        bannerRef ? getR2ObjectSize(bannerRef.bucket, bannerRef.key) : Promise.resolve(0),
      ]);
      if (avatarRef) void deleteR2Object(avatarRef.bucket, avatarRef.key);
      if (bannerRef) void deleteR2Object(bannerRef.bucket, bannerRef.key);

      const freedBytes = avatarBytes + bannerBytes;
      if (freedBytes > 0) {
        await db.update(usersTable)
          .set({ storageUsedBytes: sql`GREATEST(${usersTable.storageUsedBytes} - ${freedBytes}, 0)` })
          .where(eq(usersTable.id, userId));
      }
    }
  }

  // Fire scan for newly set media
  if (parsed.data.avatarUrl) void scanAsset(userId, 'avatar');
  if (parsed.data.bannerUrl) void scanAsset(userId, 'banner');

  res.json(safeUser);
});

router.post("/users/:userId/upgrade", requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const me = (req as any).user;
  if (me.id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  res.status(402).json({
    error: "Tier upgrades require payment — payment processor integration pending",
  });
});

router.post("/users/:userId/follow", requireAuth, async (req, res) => {
  const followingId = parseInt(req.params.userId as string);
  const followerId = (req as any).user.id;
  if (followerId === followingId) { res.status(400).json({ error: "Cannot follow yourself" }); return; }

  try {
    await db.insert(followsTable).values({ followerId, followingId });
    await db.update(usersTable).set({ followersCount: sql`${usersTable.followersCount} + 1` }).where(eq(usersTable.id, followingId));
    await db.update(usersTable).set({ followingCount: sql`${usersTable.followingCount} + 1` }).where(eq(usersTable.id, followerId));

    const summaries = await getUserSummaries([followerId]);
    const actor = summaries[followerId];
    await db.insert(notificationsTable).values({
      userId: followingId,
      type: "follow",
      message: `${actor?.displayName ?? "Someone"} started following you`,
      actorId: followerId,
    });

    // Email notification (fire-and-forget)
    const [recipient] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, followingId)).limit(1);
    if (recipient && actor) {
      sendNewFollowerEmail(recipient.email, actor.displayName ?? actor.username, actor.username);
    }
  } catch {
    // already following, ignore
  }
  res.json({ ok: true });
});

router.delete("/users/:userId/follow", requireAuth, async (req, res) => {
  const followingId = parseInt(req.params.userId as string);
  const followerId = (req as any).user.id;

  const deleted = await db.delete(followsTable)
    .where(and(eq(followsTable.followerId, followerId), eq(followsTable.followingId, followingId)))
    .returning();

  if (deleted.length > 0) {
    await db.update(usersTable).set({ followersCount: sql`GREATEST(${usersTable.followersCount} - 1, 0)` }).where(eq(usersTable.id, followingId));
    await db.update(usersTable).set({ followingCount: sql`GREATEST(${usersTable.followingCount} - 1, 0)` }).where(eq(usersTable.id, followerId));
  }
  res.json({ ok: true });
});

router.get("/users/:userId/followers", optionalAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const parsed = GetFollowersQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const followers = await db.select({ followerId: followsTable.followerId })
    .from(followsTable).where(eq(followsTable.followingId, userId)).limit(limit).offset(offset);

  const viewerId = (req as any).userId;
  const summaries = await getUserSummaries(followers.map(f => f.followerId), viewerId);
  res.json(followers.map(f => summaries[f.followerId]).filter(Boolean));
});

router.get("/users/:userId/following", optionalAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const parsed = GetFollowingQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const following = await db.select({ followingId: followsTable.followingId })
    .from(followsTable).where(eq(followsTable.followerId, userId)).limit(limit).offset(offset);

  const viewerId = (req as any).userId;
  const summaries = await getUserSummaries(following.map(f => f.followingId), viewerId);
  res.json(following.map(f => summaries[f.followingId]).filter(Boolean));
});

router.get("/users/:userId/posts", optionalAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const parsed = GetUserPostsQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const viewerId = (req as any).userId as number | undefined;
  const isAdmin = (req as any).user?.isAdmin === true;
  const isOwner = viewerId === userId;

  let isFollowing = false;
  let isSubscribed = false;
  if (viewerId && !isOwner && !isAdmin) {
    const [follow, sub] = await Promise.all([
      db.select({ id: followsTable.followerId }).from(followsTable)
        .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, userId))).limit(1),
      db.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.subscriberId, viewerId), eq(subscriptionsTable.creatorId, userId), eq(subscriptionsTable.status, "active"))).limit(1),
    ]);
    isFollowing = follow.length > 0;
    isSubscribed = sub.length > 0;
  }

  // Admins see all posts; others are filtered by follow/subscription status
  const visibilityWhere = isAdmin || isOwner
    ? eq(postsTable.authorId, userId)
    : and(
        eq(postsTable.authorId, userId),
        inArray(postsTable.visibility, isSubscribed
          ? ["public", "followers", "subscribers_only"]
          : isFollowing
            ? ["public", "followers"]
            : ["public"])
      );

  // Admins and post owners see all ratings; everyone else is gated by ratingFilter
  const viewerUser = (req as any).user;
  const ratFilter = (isAdmin || isOwner)
    ? undefined
    : ratingFilter(viewerUser?.nsfwFilter, viewerUser?.verificationMethod);
  const scanFilter = (isAdmin || isOwner) ? undefined : eq(postsTable.scanStatus, 'clean');
  const postsWhere = and(visibilityWhere, ratFilter, scanFilter);

  const posts = await db.select().from(postsTable)
    .where(postsWhere)
    .orderBy(desc(postsTable.createdAt))
    .limit(limit).offset(offset);

  const summaries = await getUserSummaries([userId], viewerId);
  const authorSummary = summaries[userId];

  let likedSet = new Set<number>();
  if (viewerId) {
    const liked = await db.select().from(likesTable).where(eq(likesTable.userId, viewerId));
    liked.forEach(l => likedSet.add(l.postId));
  }

  res.json(posts.map(p => ({
    ...p,
    author: authorSummary,
    isLiked: likedSet.has(p.id),
    hashtags: p.hashtags ?? [],
  })));
});

router.get("/users/:userId/stats", async (req, res) => {
  const userId = parseInt(req.params.userId as string);

  const [likesResult] = await db.select({ total: sql<number>`sum(${postsTable.likesCount})` })
    .from(postsTable).where(eq(postsTable.authorId, userId));
  const [viewsResult] = await db.select({ total: sql<number>`sum(${postsTable.viewsCount})` })
    .from(postsTable).where(eq(postsTable.authorId, userId));
  const [streamsResult] = await db.select({ count: sql<number>`count(*)` })
    .from(streamsTable).where(eq(streamsTable.hostId, userId));
  const [postsResult] = await db.select({ count: sql<number>`count(*)` })
    .from(postsTable).where(eq(postsTable.authorId, userId));

  res.json({
    totalLikes: Number(likesResult?.total ?? 0),
    totalViews: Number(viewsResult?.total ?? 0),
    totalTipsReceived: 0,
    totalPostsCount: Number(postsResult?.count ?? 0),
    streamsHosted: Number(streamsResult?.count ?? 0),
    topHashtags: [],
  });
});

export default router;
