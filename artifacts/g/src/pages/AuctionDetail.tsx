import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Timer, Eye, Heart, ArrowLeft, CheckCircle2, Clock, Users,
  ChevronUp, ShoppingCart, Star, Tag, Package, Zap, AlertCircle, X, Share2,
  ExternalLink, MessageSquare, TrendingUp, Crown,
} from "lucide-react";
import {
  useGetAuction, usePlaceBid, useBuyNow, useToggleAuctionWatch, useListAuctionBids,
} from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  used: "Used",
  collectible: "Collectible",
};
const ITEM_TYPE_COLORS: Record<string, string> = {
  physical: "text-emerald-400",
  digital: "text-blue-400",
  experience: "text-purple-400",
  collectible: "text-amber-400",
  commission: "text-pink-400",
  ticket: "text-cyan-400",
};

function useCountdown(endTime: string) {
  const calc = useCallback(() => {
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, diff };
  }, [endTime]);
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(t);
  }, [calc]);
  return time;
}

function CountdownDisplay({ endTime, status }: { endTime: string; status: string }) {
  const t = useCountdown(endTime);

  if (status !== "active") {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted/30 rounded-2xl">
        <span className="text-sm font-bold text-muted-foreground">
          {status === "sold" ? "SOLD" : status === "ended" ? "AUCTION ENDED" : "CANCELLED"}
        </span>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
        <AlertCircle size={14} className="text-red-400" />
        <span className="text-sm font-bold text-red-400">AUCTION ENDED</span>
      </div>
    );
  }

  const isUrgent = t.diff < 3600000;
  const segments = t.d > 0
    ? [{ label: "D", value: t.d }, { label: "H", value: t.h }, { label: "M", value: t.m }, { label: "S", value: t.s }]
    : [{ label: "H", value: t.h }, { label: "M", value: t.m }, { label: "S", value: t.s }];

  return (
    <div className={cn(
      "flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border",
      isUrgent ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20",
    )}>
      <Clock size={14} className={isUrgent ? "text-red-400" : "text-amber-400"} />
      {segments.map(({ label, value }) => (
        <div key={label} className="text-center">
          <div className={cn("text-xl font-black tabular-nums font-mono", isUrgent ? "text-red-400" : "text-amber-400")}>
            {String(value).padStart(2, "0")}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest">{label}</div>
        </div>
      ))}
    </div>
  );
}

function BidModal({ auction, onClose, onBid }: { auction: any; onClose: () => void; onBid: () => void }) {
  const placeBid = usePlaceBid();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const currentBid = auction.currentBid ?? auction.startingBid;
  const minBid = auction.bidCount > 0
    ? currentBid + Math.max(1, currentBid * 0.05)
    : currentBid;

  const handleBid = async () => {
    const num = parseFloat(amount);
    if (isNaN(num)) { setError("Enter a valid amount"); return; }
    if (num < minBid - 0.001) { setError(`Minimum bid is $${minBid.toFixed(2)}`); return; }
    try {
      setError("");
      await placeBid.mutateAsync({ auctionId: auction.id, data: { amount: num } });
      setSuccess(true);
      setTimeout(() => { onBid(); onClose(); }, 1200);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Bid failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Gavel size={16} className="text-primary" />
            <h2 className="text-base font-bold">Place a Bid</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
              <p className="font-bold text-lg">Bid placed!</p>
              <p className="text-sm text-muted-foreground mt-1">You're the highest bidder</p>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); handleBid(); }}>
              <div className="flex items-center justify-between mb-4 text-sm">
                <span className="text-muted-foreground">Current bid</span>
                <span className="font-black text-primary text-lg">${currentBid.toFixed(2)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-3">Minimum bid: <strong className="text-foreground">${minBid.toFixed(2)}</strong></div>

              {/* Quick bid buttons */}
              <div className="flex gap-2 mb-3">
                {[minBid, minBid * 1.1, minBid * 1.25].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v.toFixed(2))}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors",
                      amount === v.toFixed(2) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/40 hover:bg-muted/60",
                    )}
                  >
                    ${v.toFixed(0)}
                  </button>
                ))}
              </div>

              <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min={minBid}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder={minBid.toFixed(2)}
                  className="w-full pl-7 pr-4 py-3 bg-background border border-border/60 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary/50"
                />
              </div>
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <button
                type="submit"
                disabled={placeBid.isPending}
                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {placeBid.isPending ? "Placing..." : `Bid $${parseFloat(amount || String(minBid)).toFixed(2)}`}
              </button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">By bidding you agree to complete the purchase if you win.</p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function BuyNowModal({ auction, onClose, onDone }: { auction: any; onClose: () => void; onDone: () => void }) {
  const buyNow = useBuyNow();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleBuy = async () => {
    try {
      setError("");
      await buyNow.mutateAsync({ auctionId: auction.id });
      setSuccess(true);
      setTimeout(() => { onDone(); onClose(); }, 1400);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Purchase failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" />
            <h2 className="text-base font-bold">Buy Now</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
              <p className="font-bold text-lg">Purchase complete!</p>
              <p className="text-sm text-muted-foreground mt-1">Check your messages for delivery details.</p>
            </div>
          ) : (
            <>
              {auction.imageUrl && <img src={auction.imageUrl} alt={auction.title} className="w-full h-32 object-cover rounded-xl mb-4 opacity-80" />}
              <p className="font-semibold mb-1 line-clamp-2">{auction.title}</p>
              <div className="flex items-center justify-between mb-4 mt-3">
                <span className="text-muted-foreground text-sm">Buy Now Price</span>
                <span className="text-2xl font-black text-primary">${auction.buyNowPrice.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Funds will be deducted from your Sweatheory wallet. A 5% platform fee applies.</p>
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <button
                onClick={handleBuy}
                disabled={buyNow.isPending}
                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {buyNow.isPending ? "Processing..." : `Buy for $${auction.buyNowPrice.toFixed(2)}`}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function AuctionDetail() {
  const { id } = useParams<{ id: string }>();
  const auctionId = Number(id);
  const { user } = useCurrentUser();
  const [, navigate] = useLocation();
  const [showBid, setShowBid] = useState(false);
  const [showBuyNow, setShowBuyNow] = useState(false);

  const { data: auction, refetch, isLoading } = useGetAuction(auctionId);
  const { data: bids = [], refetch: refetchBids } = useListAuctionBids(auctionId, { limit: 15 });

  useEffect(() => {
    const t = setInterval(() => { refetch(); refetchBids(); }, 8000);
    return () => clearInterval(t);
  }, [refetch, refetchBids]);

  const toggleWatch = useToggleAuctionWatch();

  const handleWatch = async () => {
    if (!user) { navigate("/login"); return; }
    await toggleWatch.mutateAsync({ auctionId });
    refetch();
  };

  const handleBidDone = () => { refetch(); refetchBids(); };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-muted/30 rounded-2xl" />
          <div className="h-8 bg-muted/30 rounded w-2/3" />
          <div className="h-20 bg-muted/30 rounded" />
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Auction not found</p>
        <Link href="/marketplace"><button className="mt-4 text-sm text-primary hover:underline">Back to marketplace</button></Link>
      </div>
    );
  }

  const displayBid = auction.currentBid ?? auction.startingBid;
  const isOwner = user?.id === auction.sellerId;
  const isActive = auction.status === "active";
  const canBid = user && !isOwner && isActive;
  const isWinning = user && auction.currentBidderId === user.id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back */}
      <Link href="/marketplace">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft size={14} /> Auction House
        </button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left — Media + Details */}
        <div className="space-y-4">
          {/* Media */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted/20 aspect-[4/3]">
            {auction.imageUrl ? (
              <img src={auction.imageUrl} alt={auction.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gavel size={60} className="text-muted-foreground/20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            {/* Status badge */}
            <div className="absolute top-3 left-3">
              {auction.status === "active"
                ? <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">LIVE AUCTION</span>
                : <span className="text-xs font-bold px-2 py-1 rounded-lg bg-muted/70 text-muted-foreground">{auction.status.toUpperCase()}</span>}
            </div>

            {/* Watch button */}
            <button
              onClick={handleWatch}
              className={cn(
                "absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                auction.isWatching
                  ? "bg-red-500/20 border-red-500/30 text-red-400"
                  : "bg-black/40 border-white/10 text-white hover:bg-black/60",
              )}
            >
              <Heart size={12} fill={auction.isWatching ? "currentColor" : "none"} />
              {auction.watchCount}
            </button>
          </div>

          {/* Title + meta */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={cn("text-xs font-semibold", ITEM_TYPE_COLORS[auction.itemType])}>
                {auction.itemType.charAt(0).toUpperCase() + auction.itemType.slice(1)}
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground">{CONDITION_LABELS[auction.condition] ?? auction.condition}</span>
              {auction.category && (
                <>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground">{auction.category}</span>
                </>
              )}
            </div>
            <h1 className="text-xl font-black leading-tight mb-2">{auction.title}</h1>
            {auction.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{auction.description}</p>
            )}
          </div>

          {/* Tags */}
          {auction.tags && auction.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {auction.tags.map((tag: string) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-muted/40 rounded-full text-muted-foreground">#{tag}</span>
              ))}
            </div>
          )}

          {/* Shipping */}
          {auction.shippingInfo && (
            <div className="flex items-start gap-2 bg-muted/20 rounded-xl p-3 text-sm">
              <Package size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-xs text-muted-foreground mb-0.5">Shipping & Delivery</p>
                <p className="text-sm">{auction.shippingInfo}</p>
              </div>
            </div>
          )}

          {/* Bid history */}
          <div>
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-primary" />
              Bid History
              <span className="text-xs text-muted-foreground font-normal">({auction.bidCount} bids)</span>
            </h3>
            {(bids as any[]).length === 0 ? (
              <p className="text-xs text-muted-foreground">No bids yet. Be the first!</p>
            ) : (
              <div className="space-y-1.5">
                {(bids as any[]).map((bid: any, i: number) => (
                  <div key={bid.id} className={cn("flex items-center justify-between px-3 py-2 rounded-xl text-sm", bid.isWinning ? "bg-primary/10 border border-primary/20" : "bg-muted/20")}>
                    <div className="flex items-center gap-2">
                      {bid.isWinning && <Crown size={12} className="text-primary" />}
                      {bid.bidder?.avatarUrl
                        ? <img src={bid.bidder.avatarUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
                        : <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{(bid.bidder?.displayName ?? "?")[0]}</div>}
                      <span className={cn("text-xs", bid.isWinning ? "font-bold text-primary" : "text-muted-foreground")}>
                        {bid.bidder?.displayName ?? "Anonymous"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={cn("font-bold", bid.isWinning ? "text-primary" : "")}>${Number(bid.amount).toFixed(2)}</span>
                      <p className="text-[10px] text-muted-foreground">{new Date(bid.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Bid panel */}
        <div className="space-y-4">
          {/* Seller */}
          {auction.seller && (
            <Link href={`/profile/${auction.seller.username}`}>
              <div className="flex items-center gap-3 bg-card border border-border/60 rounded-2xl p-3 cursor-pointer hover:border-primary/30 transition-colors">
                {auction.seller.avatarUrl
                  ? <img src={auction.seller.avatarUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
                  : <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">{(auction.seller.displayName ?? "?")[0]}</div>}
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold">{auction.seller.displayName}</span>
                    {auction.seller.isVerified && <CheckCircle2 size={12} className="text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">@{auction.seller.username}</span>
                </div>
                <ExternalLink size={14} className="text-muted-foreground ml-auto" />
              </div>
            </Link>
          )}

          {/* Countdown */}
          <CountdownDisplay endTime={auction.endTime} status={auction.status} />

          {/* Current bid */}
          <div className="bg-card border border-border/60 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{auction.bidCount > 0 ? "Current bid" : "Starting bid"}</p>
            <p className="text-3xl font-black text-primary mb-1">${displayBid.toFixed(2)}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Gavel size={11} />{auction.bidCount} bids</span>
              <span className="flex items-center gap-1"><Eye size={11} />{auction.watchCount} watching</span>
            </div>

            {isWinning && (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2">
                <Crown size={12} />
                You're the highest bidder!
              </div>
            )}
          </div>

          {/* Reserve price indicator */}
          {auction.reservePrice && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
              <AlertCircle size={11} />
              {(auction.currentBid ?? 0) >= auction.reservePrice
                ? <span className="text-emerald-400">Reserve price met</span>
                : <span>Reserve not yet met</span>}
            </div>
          )}

          {/* Action buttons */}
          {!user ? (
            <Link href="/login">
              <button className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-2xl hover:bg-primary/90 transition-colors">
                Sign in to Bid
              </button>
            </Link>
          ) : isOwner ? (
            <div className="bg-muted/20 rounded-2xl p-3 text-center text-sm text-muted-foreground">
              This is your listing
            </div>
          ) : isActive ? (
            <div className="space-y-2">
              <button
                onClick={() => setShowBid(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground font-bold rounded-2xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                <Gavel size={16} />
                Place a Bid
              </button>
              {auction.buyNowPrice && (
                <button
                  onClick={() => setShowBuyNow(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-card border border-border/60 text-foreground text-sm font-semibold rounded-2xl hover:border-primary/40 transition-colors"
                >
                  <ShoppingCart size={15} />
                  Buy Now · ${auction.buyNowPrice.toFixed(2)}
                </button>
              )}
            </div>
          ) : null}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
            <div className="bg-muted/20 rounded-xl p-2.5">
              <p className="font-bold text-foreground text-sm">${auction.startingBid.toFixed(2)}</p>
              <p>Starting bid</p>
            </div>
            <div className="bg-muted/20 rounded-xl p-2.5">
              <p className="font-bold text-foreground text-sm">{new Date(auction.endTime).toLocaleDateString()}</p>
              <p>End date</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showBid && <BidModal auction={auction} onClose={() => setShowBid(false)} onBid={handleBidDone} />}
        {showBuyNow && <BuyNowModal auction={auction} onClose={() => setShowBuyNow(false)} onDone={handleBidDone} />}
      </AnimatePresence>
    </div>
  );
}
