import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import {
  useGetUser, useGetUserPosts, useGetMerchStorefront,
  useFollowUser, useUnfollowUser, getGetUserQueryKey,
  getGetUserPostsQueryKey, getGetMerchStorefrontQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TipButton } from "@/components/TipModal";
import { Avatar } from "@/components/Avatar";
import {
  BadgeCheck, Star, Link2, Copy, Check, Globe, Instagram,
  Package, Heart, MessageSquare, Loader2,
  Twitter, Share2, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasConsent } from "@/components/CookieConsentBanner";

// Reddit icon (not in lucide)
function RedditIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

function TikTokIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.77a8.16 8.16 0 004.77 1.53V6.85a4.85 4.85 0 01-1-.16z" />
    </svg>
  );
}

export default function LinkInBio() {
  const [, params] = useRoute("/@:username");
  const username = params?.username ?? "";
  const { user: me, isLoggedIn } = useCurrentUser();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const { data: raw, isLoading } = useGetUser(username as any, {
    query: { enabled: !!username, queryKey: getGetUserQueryKey(username as any) }
  });
  const userData = raw as any;
  const userId = userData?.id;

  const { data: postsData } = useGetUserPosts(userId, { limit: 6, offset: 0 }, {
    query: { enabled: !!userId, queryKey: getGetUserPostsQueryKey(userId, { limit: 6, offset: 0 }) }
  });
  const { data: merchData } = useGetMerchStorefront(userId, {
    query: { enabled: !!userId, queryKey: getGetMerchStorefrontQueryKey(userId) }
  });

  const followMut = useFollowUser({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }) }
  });
  const unfollowMut = useUnfollowUser({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) }) }
  });

  const isFollowing = following !== null ? following : (userData?.isFollowing ?? false);
  const isSubscribed = subscribed !== null ? subscribed : (userData?.isSubscribed ?? false);

  function toggleFollow() {
    if (!isLoggedIn) { window.location.href = "/login"; return; }
    if (isFollowing) { setFollowing(false); unfollowMut.mutate({ userId }); }
    else { setFollowing(true); followMut.mutate({ userId }); }
  }

  async function toggleSubscribe() {
    if (!isLoggedIn) { window.location.href = "/login"; return; }
    setSubscribing(true);
    try {
      const method = isSubscribed ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${userId}/subscribe`, { method, credentials: "include" });
      if (res.ok) {
        setSubscribed(!isSubscribed);
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(username as any) });
      }
    } finally { setSubscribing(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const posts = Array.isArray(postsData) ? postsData as any[] : [];
  const merch = Array.isArray((merchData as any)?.products) ? (merchData as any).products as any[] : [];

  // Custom creator links
  const [customLinks, setCustomLinks] = useState<Array<{
    id: string; title: string; url: string; icon?: string | null; clickCount: number;
  }>>([]);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/creator-links/public/${userId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setCustomLinks(Array.isArray(data) ? data : []))
      .catch(() => undefined);
  }, [userId]);

  async function trackClick(linkId: string) {
    if (!hasConsent("analytics")) return;
    await fetch(`/api/creator-links/${linkId}/click`, { method: "POST", credentials: "include" });
  }

  // Social links
  const socials: { label: string; href: string; icon: React.ReactNode; color: string }[] = [];
  if (userData?.xUsername) socials.push({ label: `@${userData.xUsername}`, href: `https://x.com/${userData.xUsername}`, icon: <Twitter size={15} />, color: "text-sky-400" });
  if (userData?.instagramUsername) socials.push({ label: `@${userData.instagramUsername}`, href: `https://instagram.com/${userData.instagramUsername}`, icon: <Instagram size={15} />, color: "text-pink-400" });
  if (userData?.tiktokUsername) socials.push({ label: `@${userData.tiktokUsername}`, href: `https://tiktok.com/@${userData.tiktokUsername}`, icon: <TikTokIcon size={15} />, color: "text-white" });
  if (userData?.redditUsername) socials.push({ label: `u/${userData.redditUsername}`, href: `https://reddit.com/user/${userData.redditUsername}`, icon: <RedditIcon size={15} />, color: "text-orange-400" });
  if (userData?.websiteUrl) socials.push({ label: "Website", href: userData.websiteUrl, icon: <Globe size={15} />, color: "text-green-400" });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-bold">@{username} not found</p>
        <p className="text-sm text-muted-foreground">This creator doesn't exist on Sweatheory yet.</p>
        <a href="/register" className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold">
          Claim your page
        </a>
      </div>
    );
  }

  const isMe = me && (me as any).id === userId;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Banner */}
      <div className="relative h-48 overflow-hidden">
        {userData.bannerUrl ? (
          <img src={userData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/40 via-primary/20 to-purple-900/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe pt-4">
          <a href="/" className="flex items-center gap-1.5 bg-black/40 backdrop-blur rounded-xl px-3 py-1.5">
            <img src="/favicon.svg" alt="G" className="w-4 h-4 rounded object-cover" />
            <span className="text-xs font-bold text-white">Sweatheory</span>
          </a>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 bg-black/40 backdrop-blur rounded-xl px-3 py-1.5 text-white text-xs font-semibold"
          >
            {copied ? <Check size={13} className="text-green-400" /> : <Share2 size={13} />}
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="px-4 -mt-16 relative z-10">
        <div className="flex items-end justify-between mb-4">
          <div className="w-24 h-24 rounded-full ring-4 ring-background overflow-hidden">
            <Avatar user={userData} fill />
          </div>
          {isMe && (
            <a href="/settings" className="px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-muted/60 transition-colors">
              Edit page
            </a>
          )}
        </div>

        {/* Name + verification */}
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-black">{userData.displayName}</h1>
          {userData.isVerified && <BadgeCheck size={18} className="text-primary flex-shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground mb-1">@{userData.username}</p>

        {userData.bio && (
          <p className="text-sm text-foreground/80 leading-relaxed mb-3 mt-2">{userData.bio}</p>
        )}

        {/* Stats */}
        <div className="flex gap-5 mb-4 text-sm">
          <div className="text-center">
            <p className="font-black">{(userData.followersCount ?? 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </div>
          <div className="text-center">
            <p className="font-black">{(userData.postsCount ?? 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Posts</p>
          </div>
          {userData.xFollowersCount ? (
            <div className="text-center">
              <p className="font-black">{(userData.xFollowersCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">X Followers</p>
            </div>
          ) : null}
        </div>

        {/* Action row */}
        {!isMe && (
          <div className="flex gap-2 mb-5">
            <button
              onClick={toggleFollow}
              className={cn(
                "flex-1 py-2.5 text-sm font-bold rounded-xl border transition-colors",
                isFollowing
                  ? "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                  : "border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>

            {userData.subscriptionPrice && (
              <button
                onClick={toggleSubscribe}
                disabled={subscribing}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors",
                  isSubscribed
                    ? "border-primary/40 text-primary bg-primary/10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                    : "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {subscribing ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} className={isSubscribed ? "fill-primary" : ""} />}
                {isSubscribed ? "Subscribed" : `$${userData.subscriptionPrice}/mo`}
              </button>
            )}

            {userId && (
              <TipButton
                recipientId={userId}
                recipientName={userData.displayName ?? userData.username}
                trigger={(open) => (
                  <button
                    onClick={open}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl border border-amber-500/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400 hover:text-black transition-colors"
                  >
                    💸 Tip
                  </button>
                )}
              />
            )}
          </div>
        )}

        {/* Social links */}
        {socials.length > 0 && (
          <div className="space-y-2 mb-6">
            {socials.map((s, i) => (
              <motion.a
                key={i}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 px-4 py-3 bg-card border border-card-border rounded-2xl hover:border-primary/30 hover:bg-muted/40 transition-colors group"
              >
                <span className={cn("flex-shrink-0", s.color)}>{s.icon}</span>
                <span className="text-sm font-semibold flex-1">{s.label}</span>
                <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </motion.a>
            ))}
          </div>
        )}

        {/* Custom creator links */}
        {customLinks.length > 0 && (
          <div className="space-y-2 mb-6">
            {customLinks.map((cl, i) => (
              <motion.a
                key={cl.id}
                href={cl.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(cl.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 px-4 py-3 bg-card border border-card-border rounded-2xl hover:border-primary/30 hover:bg-muted/40 transition-colors group"
              >
                <span className="flex-shrink-0 text-primary">
                  {cl.icon ? <span className="text-base leading-none">{cl.icon}</span> : <Link2 size={15} />}
                </span>
                <span className="text-sm font-semibold flex-1">{cl.title}</span>
                <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </motion.a>
            ))}
          </div>
        )}

        {/* View full profile */}
        <Link href={`/profile/${userData.username}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl mb-6 hover:bg-primary/10 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={15} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">View full profile</p>
              <p className="text-xs text-muted-foreground">Posts, streams, comments & more</p>
            </div>
            <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>

        {/* Latest Posts */}
        {posts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground">Latest Posts</h2>
              <Link href={`/profile/${userData.username}`}>
                <span className="text-xs text-primary hover:underline">See all</span>
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {posts.slice(0, 6).map((post: any) => (
                <Link key={post.id} href={`/post/${post.id}`}>
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-muted/40 cursor-pointer hover:opacity-90 transition-opacity">
                    {post.mediaUrl ? (
                      <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                    ) : post.muxPlaybackId ? (
                      <img src={`https://image.mux.com/${post.muxPlaybackId}/thumbnail.jpg`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <p className="text-[9px] text-muted-foreground text-center line-clamp-4 leading-tight">{post.caption}</p>
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/60 backdrop-blur rounded-md px-1 py-0.5">
                      <Heart size={8} className="text-white" />
                      <span className="text-[8px] text-white font-bold">{post.likesCount ?? 0}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Merch storefront */}
        {merch.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Package size={13} />
                Merch Store
              </h2>
              <Link href={`/merch?creator=${userId}`}>
                <span className="text-xs text-primary hover:underline">See all</span>
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
              {merch.slice(0, 6).map((product: any) => (
                <Link key={product.id} href={`/merch/${product.id}`}>
                  <div className="flex-shrink-0 w-36 bg-card border border-card-border rounded-2xl overflow-hidden cursor-pointer hover:border-primary/30 transition-colors">
                    <div className="h-36 bg-muted/30 overflow-hidden">
                      {product.previewImageUrl ? (
                        <img src={product.previewImageUrl} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">
                          {product.productType === "shirt" ? "👕" : product.productType === "hoodie" ? "🧥" : "🎁"}
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-bold truncate">{product.title}</p>
                      <p className="text-xs text-primary font-semibold mt-0.5">${Number(product.basePrice ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mx-4 mt-2 flex flex-col items-center gap-3 pb-6">
        <div className="w-full border-t border-border/40 pt-4 flex flex-col items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="G" className="w-5 h-5 rounded object-cover" />
            <span className="text-xs text-muted-foreground font-semibold">Powered by Sweatheory</span>
          </a>
          <a
            href="/register"
            className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Link2 size={13} />
            Create your free link page
          </a>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {(["linktree", "beacons", "allmylinks", "stan"] as const).map(slug => (
              <a
                key={slug}
                href={`/help/${slug}`}
                className="text-[11px] text-muted-foreground/50 hover:text-primary transition-colors capitalize"
              >
                {slug === "allmylinks" ? "AllMyLinks" : slug === "stan" ? "Stan.store" : slug.charAt(0).toUpperCase() + slug.slice(1)} →
              </a>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-center max-w-xs">
            Sweatheory — a creator platform. Build your audience and share everything in one link.
          </p>
        </div>
      </div>
    </div>
  );
}
