import { useRoute, Link } from "wouter";
import { motion } from "framer-motion";
import { useListPosts, useGetTrendingHashtags, getListPostsQueryKey } from "@workspace/api-client-react";
import { PostCard } from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { Hash, TrendingUp } from "lucide-react";

export default function Hashtag() {
  const [, params] = useRoute("/hashtag/:tag");
  const tag = params?.tag ?? "";

  const { data, isLoading } = useListPosts({ hashtag: tag, limit: 30 }, {
    query: {
      enabled: !!tag,
      queryKey: getListPostsQueryKey({ hashtag: tag, limit: 30 }),
    }
  });

  const { data: trendingTags } = useGetTrendingHashtags();
  const posts = Array.isArray(data) ? data : [];
  const hashtagList = Array.isArray(trendingTags) ? trendingTags : [];
  const related = hashtagList.filter((t: any) => t.name !== tag).slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Hash size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black">#{tag}</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : `${posts.length} post${posts.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Posts */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map(i => <PostSkeleton key={i} />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 bg-card border border-card-border rounded-xl text-muted-foreground text-sm">
              No posts with #{tag} yet.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>

        {/* Related hashtags sidebar */}
        {related.length > 0 && (
          <aside>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Related tags</h2>
            </div>
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              {related.map((t: any, i: number) => (
                <Link key={t.name} href={`/hashtag/${t.name}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer border-b border-card-border last:border-0">
                    <div>
                      <p className="text-sm font-semibold">#{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.postsCount} posts</p>
                    </div>
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
