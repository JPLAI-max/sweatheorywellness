import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useGetUser, useGetUserPosts, useGetUserStats, useFollowUser, useUnfollowUser, useCreateConversation, getGetUserQueryKey, getGetUserPostsQueryKey } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, LogOut, UserPlus, CheckCircle2, ChevronRight, Star, Loader2, MessageSquare } from "lucide-react";
import { SweatheoryApprovedBadge } from "@/components/SweatheoryApprovedBadge";
import { ProfileSongPlayer } from "@/components/ProfileSongPlayer";
import { cn } from "@/lib/utils";
import { TipButton } from "@/components/TipModal";
import { getCurrentUserId, getAccounts, switchAccount, removeCurrentAccount, type SavedAccount } from "@/lib/auth";

export default function Profile() {
  const [, params] = useRoute("/profile/:username");
  const [, setLocation] = useLocation();
  const username = params?.username ?? "";
  const { user: me } = useCurrentUser();
  const queryClient = useQueryClient();

  // Search for user by username — we rely on the search endpoint or user lookup by ID
  // The API has GET /users/:userId, so we search first to get the ID
  const { data: searchResult, isLoading: searching } = useGetUser(username as any, {
    query: {
      enabled: !!username,
      queryKey: getGetUserQueryKey(username as any),
    }
  });

  const userData = searchResult as any;
  const userId = userData?.id;

  const { data: postsData, isLoading: postsLoading } = useGetUserPosts(userId, { limit: 20, offset: 0 }, {
    query: { enabled: !!userId, queryKey: getGetUserPostsQueryKey(userId, { limit: 20, offset: 0 }) }
  });

  const { data: statsData } = useGetUserStats(userId, {
    query: { enabled: !!userId, queryKey: ["users", userId, "stats"] }
  });

  const [following, setFollowing] = useState<boolean | null>(null);
  const isFollowing = following !== null ? following : userData?.isFollowing ?? false;

  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const isSubscribed = subscribed !== null ? subscribed : userData?.isSubscribed ?? false;
  const [subscribing, setSubscribing] = useState(false);
  const [subError, setSubError] = useState("");

  async function toggleSubscribe() {
    if (!me) { setLocation("/login"); return; }
    setSubError("");
    setSubscribing(true);
    try {
      if (isSubscribed) {
        const res = await fetch(`/api/users/${userId}/subscribe`, { method: "DELETE", credentials: "include" });
        if (res.ok) { setSubscribed(false); queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }); }
        else { const d = await res.json(); setSubError(d.error ?? "Failed to cancel"); }
      } else {
        const res = await fetch(`/api/users/${userId}/subscribe`, { method: "POST", credentials: "include" });
        if (res.ok) { setSubscribed(true); queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }); }
        else { const d = await res.json(); setSubError(d.error ?? "Failed to subscribe"); }
      }
    } finally {
      setSubscribing(false);
    }
  }

  const followMut = useFollowUser({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }) } });
  const unfollowMut = useUnfollowUser({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }) } });
  const createConversation = useCreateConversation();

  async function openDM() {
    if (!me) { setLocation("/login"); return; }
    if (!userId) return;
    try {
      const conv = await createConversation.mutateAsync({ data: { participantId: userId } });
      setLocation(`/messages/${conv.id}`);
    } catch {
      // ignore
    }
  }

  function toggleFollow() {
    if (!me) { setLocation("/login"); return; }
    if (isFollowing) {
      setFollowing(false);
      unfollowMut.mutate({ userId });
    } else {
      setFollowing(true);
      followMut.mutate({ userId });
    }
  }

  const posts = Array.isArray(postsData) ? postsData : [];
  const stats = statsData as any;
  const isMe = me && (me as any).id === userId;

  const accounts = getAccounts();
  // Use the server-authoritative user ID (from the JWT cookie) rather than
  // localStorage, which can be stale if the user switched accounts in another tab.
  const currentId = me?.id ?? getCurrentUserId();
  const otherAccounts = accounts.filter(a => a.id !== currentId);

  if (searching) {
    return (
      <div className="px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded w-32" />
          <div className="h-4 bg-muted rounded w-48" />
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Banner */}
      <div className="relative h-40 bg-gradient-to-br from-primary/30 to-primary/5">
        {userData.bannerUrl && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={userData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Profile song player */}
      {userData.profileSongUrl && (
        <ProfileSongPlayer
          songUrl={userData.profileSongUrl}
          songTitle={userData.profileSongTitle}
          songArtist={userData.profileSongArtist}
        />
      )}

      {/* Profile info */}
      <div className="px-4 pb-6">
        <div className="relative flex items-end justify-between -mt-12 mb-4">
          <div className="relative z-10 w-24 h-24 rounded-full ring-4 ring-background overflow-hidden flex-shrink-0">
            <Avatar user={userData} fill />
          </div>
          <div className="flex gap-2 mb-1">
            {isMe ? (
              <button
                onClick={() => setLocation("/settings")}
                data-testid="edit-profile-button"
                className="px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted/60 transition-colors"
              >
                Edit profile
              </button>
            ) : (
              <>
                <button
                  onClick={toggleFollow}
                  data-testid="follow-button"
                  className={cn(
                    "px-5 py-2 text-sm font-semibold rounded-xl transition-colors border",
                    isFollowing
                      ? "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                      : "border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                  )}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
                {userData?.subscriptionPrice && userId && (
                  <button
                    onClick={toggleSubscribe}
                    disabled={subscribing}
                    data-testid="subscribe-button"
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors",
                      isSubscribed
                        ? "border-primary/40 text-primary bg-primary/10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                        : "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {subscribing
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Star size={13} className={isSubscribed ? "fill-primary" : ""} />
                    }
                    {isSubscribed ? "Subscribed" : `Subscribe · $${userData.subscriptionPrice}/mo`}
                  </button>
                )}
                {userId && (
                  <TipButton
                    recipientId={userId}
                    recipientName={userData.displayName ?? userData.username}
                    trigger={(open) => (
                      <button
                        onClick={open}
                        data-testid="tip-profile-button"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-amber-500/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400 hover:text-black transition-colors"
                      >
                        <span>🎁</span>
                        Tip
                      </button>
                    )}
                  />
                )}
                {userId && (
                  <Link href={`/requests?creatorId=${userId}&creatorName=${encodeURIComponent(userData?.displayName ?? userData?.username ?? "")}`}>
                    <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-rose-500/30 text-rose-400 bg-rose-400/5 hover:bg-rose-400/10 transition-colors">
                      <span>✏️</span>
                      Request
                    </button>
                  </Link>
                )}
                {userId && me && (
                  <button
                    onClick={openDM}
                    disabled={createConversation.isPending}
                    data-testid="message-profile-button"
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-border hover:bg-muted/60 transition-colors"
                  >
                    {createConversation.isPending
                      ? <Loader2 size={13} className="animate-spin" />
                      : <MessageSquare size={13} />
                    }
                    Message
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {subError && (
          <div className="mx-0 mb-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
            {subError}
          </div>
        )}

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-bold">{userData.displayName}</h1>
            {userData.isVerified && <SweatheoryApprovedBadge size="md" />}
            {userData.isPremium && (
              <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">Pro</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">@{userData.username}</p>
          {userData.bio && <p className="text-sm leading-relaxed mb-3">{userData.bio}</p>}

          {/* Social badges */}
          {(userData.redditUsername || userData.xUsername) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {userData.redditUsername && (
                <a
                  href={`https://reddit.com/user/${userData.redditUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-orange-500/30 bg-orange-500/8 text-orange-400 text-xs font-semibold hover:bg-orange-500/15 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                  </svg>
                  u/{userData.redditUsername}
                  {userData.redditKarma != null && (
                    <span className="opacity-70">· {(userData.redditKarma as number).toLocaleString()} karma</span>
                  )}
                </a>
              )}
              {userData.xUsername && (
                <a
                  href={`https://x.com/${userData.xUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-500/30 bg-sky-500/8 text-sky-400 text-xs font-semibold hover:bg-sky-500/15 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  @{userData.xUsername}
                  {userData.xFollowersCount != null && (
                    <span className="opacity-70">· {(userData.xFollowersCount as number).toLocaleString()} followers</span>
                  )}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mb-6 text-sm">
          <div>
            <span className="font-bold">{(userData.postsCount ?? 0).toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">posts</span>
          </div>
          <div className="cursor-pointer hover:text-primary transition-colors">
            <span className="font-bold">{(userData.followersCount ?? 0).toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">followers</span>
          </div>
          <div className="cursor-pointer hover:text-primary transition-colors">
            <span className="font-bold">{(userData.followingCount ?? 0).toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">following</span>
          </div>
        </div>

        {/* Stats cards (if available) */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-card border border-card-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{(stats.totalLikes ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total likes</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{(stats.totalViews ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total views</p>
            </div>
          </div>
        )}

        {/* Posts */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
            <FileText size={14} />
            Posts
          </h2>
          {postsLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map(i => <PostSkeleton key={i} />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm bg-card border border-card-border rounded-xl">
              No posts yet.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post: any, index: number) => (
                <div key={post.id} style={{ position: "relative", zIndex: posts.length - index }}>
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account management — only visible on own profile */}
        {isMe && (
          <div className="mt-8 border-t border-border/60 pt-6 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Accounts</h2>

            {/* Current account row */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40">
              <Avatar user={userData} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{userData.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">@{userData.username}</p>
              </div>
              <CheckCircle2 size={16} className="text-primary flex-shrink-0" />
            </div>

            {/* Other saved accounts */}
            {otherAccounts.map((acct: SavedAccount) => (
              <button
                key={acct.id}
                onClick={() => switchAccount()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                  {(acct.displayName || acct.username)[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{acct.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">@{acct.username}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
              </button>
            ))}

            {/* Add account */}
            <button
              onClick={() => setLocation("/login")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors text-sm"
            >
              <UserPlus size={15} />
              Add account
            </button>

            {/* Sign out */}
            <button
              data-testid="logout-button"
              onClick={removeCurrentAccount}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-sm"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
