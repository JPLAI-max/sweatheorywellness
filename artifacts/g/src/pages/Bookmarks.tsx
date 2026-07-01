import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useGetBookmarks, getGetBookmarksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PostCard } from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { Bookmark, Film, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "all" | "posts" | "clips";

export default function Bookmarks() {
  const isAuthed = useRequireAuth();

  const [tab, setTab] = useState<Tab>("all");
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetBookmarks({ limit: 50, offset: 0 }, {
    query: { queryKey: getGetBookmarksQueryKey({ limit: 50, offset: 0 }) }
  });

  const all = Array.isArray(data) ? data : [];
  const posts = all.filter((p: any) => p.type !== "video");
  const clips = all.filter((p: any) => p.type === "video");

  const displayed = tab === "all" ? all : tab === "posts" ? posts : clips;

  const tabs: { value: Tab; label: string; icon: any; count: number }[] = [
    { value: "all",   label: "All saved",  icon: Bookmark,  count: all.length },
    { value: "posts", label: "Posts",      icon: AlignLeft, count: posts.length },
    { value: "clips", label: "Clips",      icon: Film,      count: clips.length },
  ];

  if (!isAuthed) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-5 flex items-center gap-2">
        <Bookmark size={20} className="text-primary" />
        Saved
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 border border-border/60 rounded-xl p-1 mb-5 w-fit">
        {tabs.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all",
              tab === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon size={13} />
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === t.value ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map(i => <PostSkeleton key={i} />)}
        </div>
      ) : displayed.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 bg-card border border-card-border rounded-xl"
        >
          {tab === "clips"
            ? <Film size={36} className="text-muted-foreground mx-auto mb-3 opacity-40" />
            : <Bookmark size={36} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          }
          <p className="font-semibold mb-1">
            {tab === "clips" ? "No saved clips yet" : tab === "posts" ? "No saved posts yet" : "Nothing saved yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {tab === "clips"
              ? "Bookmark video posts and they'll appear here."
              : "Tap the bookmark icon on any post to save it here."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {displayed.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={() => {
                queryClient.invalidateQueries({ queryKey: getGetBookmarksQueryKey() });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
