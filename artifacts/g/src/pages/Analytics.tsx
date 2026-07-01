import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useGetUserStats, useGetUserPosts, useGetTransactions, getGetTransactionsQueryKey, getGetUserStatsQueryKey, getGetUserPostsQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PostCard } from "@/components/PostCard";
import { PostSkeleton } from "@/components/SkeletonLoader";
import { BarChart2, Eye, Heart, Users, Zap, TrendingUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-card-border rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={color ?? "text-muted-foreground"} />
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn("text-3xl font-black", color ?? "text-foreground")}>{value}</p>
    </motion.div>
  );
}

export default function Analytics() {
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const userId = (user as any)?.id;

  const { data: stats, isLoading: statsLoading } = useGetUserStats(userId, {
    query: { enabled: !!userId, queryKey: getGetUserStatsQueryKey(userId) }
  });

  const { data: postsData, isLoading: postsLoading } = useGetUserPosts(userId, { limit: 20, offset: 0 }, {
    query: { enabled: !!userId, queryKey: getGetUserPostsQueryKey(userId, { limit: 20, offset: 0 }) }
  });

  const { data: txData } = useGetTransactions({ limit: 100, offset: 0 }, {
    query: { queryKey: getGetTransactionsQueryKey({ limit: 100, offset: 0 }) }
  });

  const s = stats as any;
  const posts = Array.isArray(postsData) ? postsData as any[] : [];
  const txs = Array.isArray(txData) ? txData as any[] : [];

  // Compute total tips received from transactions
  const tipsReceived = txs
    .filter((t: any) => t.type === "tip" && t.relatedUserId === userId)
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  // Top posts by engagement (likes + comments + views)
  const topPosts = [...posts]
    .sort((a, b) => (b.likesCount + b.commentsCount + b.viewsCount) - (a.likesCount + a.commentsCount + a.viewsCount))
    .slice(0, 3);

  // Recent earnings breakdown
  const earnings = txs.filter((t: any) => t.type === "tip").slice(0, 5);

  if (!isAuthed) return null;
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <BarChart2 size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Creator analytics</h1>
          <p className="text-sm text-muted-foreground">Your performance at a glance</p>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[0,1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={FileText} label="Posts" value={(s?.totalPostsCount ?? 0).toLocaleString()} color="text-primary" />
          <StatCard icon={Heart} label="Total likes" value={(s?.totalLikes ?? 0).toLocaleString()} color="text-red-400" />
          <StatCard icon={Eye} label="Total views" value={(s?.totalViews ?? 0).toLocaleString()} color="text-blue-400" />
          <StatCard icon={Zap} label="Tips earned" value={`$${(tipsReceived).toFixed(2)}`} color="text-amber-400" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Follower card */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-primary" />
            <h2 className="font-bold text-sm">Audience</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Followers</span>
              <span className="font-bold text-lg">{((user as any)?.followersCount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Following</span>
              <span className="font-bold text-lg">{((user as any)?.followingCount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Streams hosted</span>
              <span className="font-bold text-lg">{(s?.streamsHosted ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Recent tips */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-amber-400" />
            <h2 className="font-bold text-sm">Recent tips received</h2>
          </div>
          {earnings.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No tips yet — keep creating!
            </div>
          ) : (
            <div className="space-y-2.5">
              {earnings.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[160px]">{t.description || "Tip received"}</span>
                  <span className="font-semibold text-amber-400">+${Number(t.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top posts */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-primary" />
          <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Top performing posts</h2>
        </div>
        {postsLoading ? (
          <div className="space-y-4">
            {[0,1,2].map(i => <PostSkeleton key={i} />)}
          </div>
        ) : topPosts.length === 0 ? (
          <div className="text-center py-12 bg-card border border-card-border rounded-xl text-muted-foreground text-sm">
            No posts yet — start creating to see your stats here.
          </div>
        ) : (
          <div className="space-y-4">
            {topPosts.map((post: any, i: number) => {
              const isPoll = post.type === "text" && post.caption?.startsWith("[POLL]");
              let pollQuestion = "";
              let pollOpts: string[] = [];
              let totalVotes = 0;
              if (isPoll) {
                const lines = post.caption.split("\n");
                pollQuestion = lines[0]?.replace("[POLL]", "").trim();
                const optLine = lines.find((l: string) => l.startsWith("[OPTIONS]"));
                pollOpts = optLine?.replace("[OPTIONS]", "").split("|").map((o: string) => o.trim()).filter(Boolean) ?? [];
                const votesLine = lines.find((l: string) => l.startsWith("[VOTES]"));
                if (votesLine) {
                  const v = votesLine.replace("[VOTES]", "").split("|").map(Number);
                  totalVotes = v.reduce((a: number, b: number) => a + b, 0);
                }
              }
              return (
                <div key={post.id} className="relative">
                  <div className="absolute -left-3 top-4 w-6 h-6 bg-primary/15 text-primary text-xs font-bold rounded-full flex items-center justify-center z-10">
                    {i + 1}
                  </div>
                  <div className="ml-4">
                    {isPoll ? (
                      <div className="bg-card border border-card-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart2 size={15} className="text-primary" />
                          <span className="text-xs font-bold text-primary uppercase tracking-wide">Poll</span>
                          <span className="ml-auto text-xs text-muted-foreground">{post.likesCount + post.commentsCount} interactions</span>
                        </div>
                        <p className="font-semibold text-sm mb-3">{pollQuestion}</p>
                        {totalVotes === 0 ? (
                          <div className="space-y-2">
                            {pollOpts.map((opt: string, j: number) => (
                              <div key={j} className="text-sm text-muted-foreground px-3 py-2 bg-muted/40 rounded-xl">{opt}</div>
                            ))}
                            <p className="text-xs text-muted-foreground text-center pt-1">No vote data available</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {pollOpts.map((opt: string, j: number) => {
                              const votes = 0;
                              const pct = totalVotes > 0 ? Math.round(votes / totalVotes * 100) : 0;
                              return (
                                <div key={j}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="font-medium">{opt}</span>
                                    <span className="text-muted-foreground">{pct}%</span>
                                  </div>
                                  <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <PostCard post={post} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
