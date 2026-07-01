import { db, usersTable, followsTable, subscriptionsTable } from "@workspace/db";
import { serveMediaUrl } from "./r2";
import { eq, inArray, and, or, gte } from "drizzle-orm";

/**
 * Returns true if the given viewer is permitted to access the post.
 * Mirrors the visibility logic in GET /posts/:postId.
 */
export async function canViewPost(
  post: { visibility: string; authorId: number },
  viewerId: number | undefined,
  isAdmin = false,
): Promise<boolean> {
  if (isAdmin || post.authorId === viewerId) return true;
  if (post.visibility === "public") return true;
  if (post.visibility === "private") return false;

  // followers or subscribers_only require an authenticated viewer
  if (!viewerId) return false;

  if (post.visibility === "followers") {
    const [follow] = await db.select({ id: followsTable.id })
      .from(followsTable)
      .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, post.authorId)))
      .limit(1);
    return !!follow;
  }

  if (post.visibility === "subscribers_only") {
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
    return !!sub;
  }

  return false;
}

export async function getUserSummary(userId: number, viewerId?: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;

  let isFollowing = false;
  if (viewerId) {
    const [follow] = await db.select({ id: followsTable.id })
      .from(followsTable)
      .where(and(eq(followsTable.followerId, viewerId), eq(followsTable.followingId, userId)))
      .limit(1);
    isFollowing = !!follow;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarScanStatus === 'clean' ? await serveMediaUrl(user.avatarUrl) : null,
    isVerified: user.isVerified,
    isFollowing,
    followersCount: user.followersCount,
  };
}

export async function getUserSummaries(userIds: number[], viewerId?: number) {
  if (userIds.length === 0) return {};
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));

  let followingSet = new Set<number>();
  if (viewerId) {
    const follows = await db.select().from(followsTable)
      .where(eq(followsTable.followerId, viewerId));
    follows.forEach(f => { if (userIds.includes(f.followingId)) followingSet.add(f.followingId); });
  }

  const map: Record<number, any> = {};
  await Promise.all(users.map(async user => {
    map[user.id] = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarScanStatus === 'clean' ? await serveMediaUrl(user.avatarUrl) : null,
      isVerified: user.isVerified,
      isFollowing: followingSet.has(user.id),
      followersCount: user.followersCount,
    };
  }));
  return map;
}
