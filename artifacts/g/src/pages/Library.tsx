import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Lock, Download, Calendar, DollarSign, ArrowLeft, Play, RefreshCw, PackageOpen } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "unlocked" | "orders";

interface LibraryPost {
  id: number;
  type: string;
  caption: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  muxPlaybackId?: string;
  price?: number;
  allowDownload?: boolean;
  author?: { id: number; username: string; displayName: string; avatarUrl?: string };
  unlockedAt: string;
  amountPaid: number;
  hasDownloadAccess: boolean;
}

interface CustomOrder {
  id: number;
  title: string;
  description: string;
  contentType: string;
  budget: number;
  status: string;
  deliveryUrl?: string;
  deliveryNote?: string;
  createdAt: string;
  creator?: { username: string; displayName: string; avatarUrl?: string };
  requester?: { username: string; displayName: string; avatarUrl?: string };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:      { label: "Pending",      cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  accepted:     { label: "Accepted",     cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  rejected:     { label: "Rejected",     cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  counteroffered: { label: "Counteroffer", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  in_progress:  { label: "In Progress",  cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  delivered:    { label: "Delivered",    cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  completed:    { label: "Completed",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled:    { label: "Cancelled",    cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
};

export default function Library() {
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("unlocked");
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    fetchUnlocked();
    fetchOrders();
  }, []);

  async function fetchUnlocked() {
    setLoadingPosts(true);
    try {
      const r = await fetch("/api/library?limit=50", { credentials: "include" });
      if (r.ok) setPosts(await r.json());
    } finally {
      setLoadingPosts(false);
    }
  }

  async function fetchOrders() {
    setLoadingOrders(true);
    try {
      const r = await fetch("/api/custom-requests?role=sent&limit=50", { credentials: "include" });
      if (r.ok) setOrders(await r.json());
    } finally {
      setLoadingOrders(false);
    }
  }

  async function handleDownload(post: LibraryPost) {
    if (!post.mediaUrl) return;
    try {
      const a = document.createElement("a");
      a.href = post.mediaUrl;
      a.download = `post-${post.id}`;
      a.target = "_blank";
      a.click();
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }

  const loading = tab === "unlocked" ? loadingPosts : loadingOrders;

  if (!isAuthed) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => history.back()} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <ShoppingBag size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">My Library</h1>
            <p className="text-xs text-muted-foreground">Purchased content &amp; orders</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl mb-6">
        {(["unlocked", "orders"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "unlocked" ? `Unlocked Posts${posts.length > 0 ? ` (${posts.length})` : ""}` : `Custom Orders${orders.length > 0 ? ` (${orders.length})` : ""}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 bg-card border border-card-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : tab === "unlocked" ? (
        posts.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <PackageOpen size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">No unlocked content yet</p>
            <p className="text-sm text-muted-foreground mb-5">Browse the feed and unlock paid posts to see them here.</p>
            <Link href="/feed">
              <button className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
                Browse Feed
              </button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-card-border rounded-2xl overflow-hidden"
              >
                <div className="flex gap-3 p-3">
                  {/* Thumbnail */}
                  <Link href={`/post/${post.id}`}>
                    <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-muted relative cursor-pointer">
                      {post.thumbnailUrl || post.mediaUrl ? (
                        <img src={post.thumbnailUrl ?? post.mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock size={18} className="text-muted-foreground" />
                        </div>
                      )}
                      {post.type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play size={18} className="text-white" fill="white" />
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {post.author && (
                          <Link href={`/profile/${post.author.username}`}>
                            <span className="text-sm font-semibold hover:text-primary transition-colors truncate">{post.author.displayName}</span>
                          </Link>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDistanceToNow(new Date(post.unlockedAt), { addSuffix: true })}
                      </span>
                    </div>

                    {post.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.caption}</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <DollarSign size={10} />
                        ${post.amountPaid.toFixed(2)} paid
                      </span>
                      <Link href={`/post/${post.id}`}>
                        <button className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1 transition-colors">
                          View content
                        </button>
                      </Link>
                      {post.hasDownloadAccess && post.mediaUrl && (
                        <button
                          onClick={() => handleDownload(post)}
                          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
                        >
                          <Download size={11} />
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      ) : (
        /* Orders tab */
        orders.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <PackageOpen size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">No custom orders yet</p>
            <p className="text-sm text-muted-foreground mb-5">Visit a creator's profile to request custom content.</p>
            <Link href="/explore">
              <button className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
                Find creators
              </button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const meta = STATUS_META[order.status] ?? STATUS_META.pending;
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-card-border rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={`/requests/${order.id}`}>
                        <h3 className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer truncate">{order.title}</h3>
                      </Link>
                      {order.creator && (
                        <p className="text-xs text-muted-foreground">
                          Creator: <Link href={`/profile/${order.creator.username}`}><span className="text-primary hover:text-primary/80 cursor-pointer">{order.creator.displayName}</span></Link>
                        </p>
                      )}
                    </div>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0", meta.cls)}>{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="text-emerald-400 font-semibold">${order.budget.toFixed(2)}</span>
                    <span className="capitalize">{order.contentType}</span>
                    <span>{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}</span>
                  </div>
                  {order.status === "delivered" && order.deliveryUrl && (
                    <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <p className="text-xs font-semibold text-emerald-400 mb-1">Content delivered!</p>
                      {order.deliveryNote && <p className="text-xs text-muted-foreground mb-2">{order.deliveryNote}</p>}
                      <a href={order.deliveryUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1">
                        <Download size={11} /> Access delivery
                      </a>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
