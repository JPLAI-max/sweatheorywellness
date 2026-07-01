import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch, useGetTrendingHashtags, useGetTrendingPosts, getGetTrendingPostsQueryKey, getSearchQueryKey } from "@workspace/api-client-react";
import { PostCard } from "@/components/PostCard";
import { UserCard } from "@/components/UserCard";
import { PostSkeleton, UserSkeleton } from "@/components/SkeletonLoader";
import { Search, Hash, TrendingUp, UserPlus, Lock } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function GuestWall({ onDismiss }: { onDismiss: () => void }) {
  const [, setLocation] = useLocation();
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onDismiss}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xs bg-card border border-border/80 rounded-3xl shadow-2xl p-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <Lock size={20} className="text-primary" />
        </div>
        <h3 className="font-black text-base mb-1">Create an account</h3>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Sign up to like, comment, follow creators and more.
        </p>
        <button
          onClick={() => setLocation("/register")}
          className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-2xl hover:bg-primary/90 transition-colors mb-2"
        >
          Create free account
        </button>
        <button
          onClick={() => setLocation("/login")}
          className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground font-semibold transition-colors"
        >
          Sign in
        </button>
      </motion.div>
    </div>
  );
}

export default function Explore() {
  const [, setLocation] = useLocation();
  const { isLoggedIn } = useCurrentUser();

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialTag = searchParams.get("tag") || "";

  const [query, setQuery] = useState(initialTag ? `#${initialTag}` : "");
  const [activeTab, setActiveTab] = useState<"posts" | "users">("posts");
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [showGuestWall, setShowGuestWall] = useState(false);

  function handleGuestInteract(e: React.MouseEvent) {
    if (!isLoggedIn) {
      e.preventDefault();
      e.stopPropagation();
      setShowGuestWall(true);
    }
  }

  const searchQuery = query.startsWith("#") ? query.slice(1) : query;

  const { data: searchResults, isLoading: searchLoading } = useSearch(
    { q: searchQuery, type: activeTab },
    { query: { enabled: searchQuery.length > 0, queryKey: getSearchQueryKey({ q: searchQuery, type: activeTab }) } }
  );

  const trendingParams = { limit: 20, sort } as const;
  const { data: trending, isLoading: trendingLoading } = useGetTrendingPosts(trendingParams, {
    query: { enabled: searchQuery.length === 0, queryKey: getGetTrendingPostsQueryKey(trendingParams) }
  });

  const { data: hashtags } = useGetTrendingHashtags();

  const posts = (searchResults as any)?.posts ?? (Array.isArray(trending) ? trending : []);
  const users = (searchResults as any)?.users ?? [];
  const hashtagList = Array.isArray(hashtags) ? hashtags : [];
  const isLoading = searchQuery.length > 0 ? searchLoading : trendingLoading;

  return (
    <div className="px-4 py-6 relative">
      {/* Guest CTA banner */}
      {!isLoggedIn && (
        <div className="mb-5 flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3">
          <UserPlus size={16} className="text-primary flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            <span className="font-semibold">You're browsing as a guest.</span>{" "}
            <span className="text-muted-foreground">Create an account to interact with content.</span>
          </p>
          <button
            onClick={() => setLocation("/register")}
            className="flex-shrink-0 text-xs font-bold text-primary hover:underline"
          >
            Join free
          </button>
        </div>
      )}

      <h1 className="text-xl font-bold mb-5">Explore</h1>

      {/* Sort tabs — shown when not searching */}
      {searchQuery.length === 0 && (
        <div className="flex gap-1 mb-5 border-b border-border/60">
          {([
            { id: "new" as const, label: "New" },
            { id: "hot" as const, label: "🔥 Hot" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={cn(
                "px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors relative whitespace-nowrap",
                sort === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {sort === id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search posts, users, or #hashtags..."
          data-testid="explore-search-input"
          className="w-full bg-input border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
        />
      </div>

      {/* Trending hashtags */}
      {hashtagList.length > 0 && searchQuery.length === 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {hashtagList.slice(0, 8).map((tag: any) => (
            <button
              key={tag.name}
              onClick={() => setQuery(`#${tag.name}`)}
              data-testid="hashtag-chip"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <Hash size={12} />
              {tag.name}
              <span className="text-xs text-primary/60 ml-1">{tag.postsCount}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs (when searching) */}
      {searchQuery.length > 0 && (
        <div className="flex gap-1 mb-5 bg-muted/40 p-1 rounded-lg w-fit">
          {(["posts", "users"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        {searchQuery.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Results for <span className="text-foreground font-medium">"{searchQuery}"</span>
          </p>
        ) : (
          <>
            <TrendingUp size={16} className="text-primary" />
            <h2 className="text-sm font-bold">Trending</h2>
          </>
        )}
      </div>

      {/* Content — wrapped with click interceptor for guests */}
      <div className="relative">
        {isLoading ? (
          <div className="space-y-4">
            {activeTab === "posts" ? [0,1,2].map(i => <PostSkeleton key={i} />) : [0,1,2].map(i => <UserSkeleton key={i} />)}
          </div>
        ) : activeTab === "posts" || searchQuery.length === 0 ? (
          posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm bg-card rounded-xl border border-card-border">
              No posts found.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post: any, index: number) => (
                <div key={post.id} style={{ position: "relative", zIndex: posts.length - index }}>
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          )
        ) : (
          users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm bg-card rounded-xl border border-card-border">
              No users found.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user: any) => <UserCard key={user.id} user={user} />)}
            </div>
          )
        )}

        {/* Invisible click-capture layer for guests */}
        {!isLoggedIn && (
          <div
            className="absolute inset-0 cursor-pointer"
            style={{ zIndex: 9999 }}
            onClick={handleGuestInteract}
          />
        )}
      </div>

      {/* Guest wall modal */}
      <AnimatePresence>
        {showGuestWall && <GuestWall onDismiss={() => setShowGuestWall(false)} />}
      </AnimatePresence>
    </div>
  );
}
