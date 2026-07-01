import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Timer, Eye, Heart, Zap, Package, Star, TrendingUp,
  Search, Plus, Filter, ChevronDown, ArrowUpRight, CheckCircle2,
  Tag, Users, Clock, Flame, ShoppingBag, Sparkles,
} from "lucide-react";
import { useListAuctions } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { useCategories } from "@/lib/categories";
import MerchMarketplace from "./MerchMarketplace";
import AffiliateMarketplace from "./AffiliateMarketplace";

const ITEM_TYPES = [
  { label: "All", value: "" },
  { label: "Digital", value: "digital" },
  { label: "Experience", value: "experience" },
  { label: "Collectible", value: "collectible" },
  { label: "Commission", value: "commission" },
  { label: "Ticket", value: "ticket" },
];

const SORT_OPTIONS = [
  { label: "Ending Soon", value: "ending_soon" },
  { label: "Highest Bid", value: "highest_bid" },
  { label: "Newest", value: "newest" },
  { label: "Buy Now", value: "buy_now" },
];

const TYPE_COLORS: Record<string, string> = {
  physical: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  digital: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  experience: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  collectible: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  commission: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  ticket: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  used: "Used",
  collectible: "Collectible",
};

function useCountdown(endTime: string) {
  const calc = useCallback(() => {
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, diff };
  }, [endTime]);

  const [time, setTime] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(t);
  }, [calc]);
  return time;
}

function CountdownBadge({ endTime, compact }: { endTime: string; compact?: boolean }) {
  const t = useCountdown(endTime);
  if (!t) return <span className="text-xs text-red-400 font-bold">ENDED</span>;

  const isUrgent = t.diff < 3600000; // < 1 hour
  const label = t.h > 0
    ? compact ? `${t.h}h ${t.m}m` : `${t.h}h ${t.m}m ${t.s}s`
    : `${t.m}m ${t.s}s`;

  return (
    <span className={cn("text-xs font-mono font-bold tabular-nums", isUrgent ? "text-red-400" : "text-amber-400")}>
      {isUrgent && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1 animate-pulse" />}
      {label}
    </span>
  );
}

function AuctionCard({ auction }: { auction: any }) {
  const [, navigate] = useLocation();
  const displayBid = auction.currentBid ?? auction.startingBid;
  const hasImage = !!auction.imageUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className="group bg-card border border-border/60 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
      onClick={() => navigate(`/auction/${auction.id}`)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-muted/60 to-muted/30 overflow-hidden">
        {hasImage ? (
          <img src={auction.imageUrl} alt={auction.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gavel size={36} className="text-muted-foreground/30" />
          </div>
        )}

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Badges top-left */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md border", TYPE_COLORS[auction.itemType] ?? "text-muted-foreground bg-card border-border")}>
            {auction.itemType.charAt(0).toUpperCase() + auction.itemType.slice(1)}
          </span>
          {auction.condition !== "new" && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/50 text-white/70 border border-white/10">
              {CONDITION_LABELS[auction.condition]}
            </span>
          )}
        </div>

        {/* Buy Now badge */}
        {auction.buyNowPrice && auction.status === "active" && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
              Buy Now
            </span>
          </div>
        )}

        {/* Bottom overlay: timer + bids */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
            <Clock size={10} className="text-muted-foreground" />
            {auction.status === "active"
              ? <CountdownBadge endTime={auction.endTime} compact />
              : <span className="text-xs font-bold text-muted-foreground">{auction.status.toUpperCase()}</span>}
          </div>
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
            <Gavel size={10} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{auction.bidCount}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-sm font-semibold line-clamp-2 leading-snug mb-2">{auction.title}</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground">{auction.bidCount > 0 ? "Current bid" : "Starting bid"}</p>
            <p className="text-base font-black text-primary">${displayBid.toFixed(2)}</p>
          </div>
          {auction.buyNowPrice && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Buy now</p>
              <p className="text-sm font-bold">${auction.buyNowPrice.toFixed(2)}</p>
            </div>
          )}
        </div>

        {auction.seller && (
          <div className="mt-2 flex items-center gap-1.5">
            {auction.seller.avatarUrl
              ? <img src={auction.seller.avatarUrl} className="w-4 h-4 rounded-full object-cover" alt="" />
              : <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">{(auction.seller.displayName ?? "?")[0]}</div>
            }
            <span className="text-[10px] text-muted-foreground truncate">{auction.seller.displayName}</span>
            {auction.seller.isVerified && <CheckCircle2 size={9} className="text-primary flex-shrink-0" />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AuctionMarketplace() {
  const { user } = useCurrentUser();
  const [, navigate] = useLocation();
  const { categories: baseCategories } = useCategories();
  const CATEGORIES = ["All", ...baseCategories];

  const initialTab = (): "merch" | "auctions" | "shop" => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "shop" || t === "auctions" || t === "merch") return t;
    } catch { /* noop */ }
    return "merch";
  };

  const [tab, setTab] = useState<"merch" | "auctions" | "shop">(initialTab);
  const [category, setCategory] = useState("All");
  const [itemType, setItemType] = useState("");
  const [sort, setSort] = useState("ending_soon");
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data: auctions = [], isLoading, refetch } = useListAuctions({
    category: category === "All" ? undefined : category,
    itemType: itemType || undefined,
    sort: sort as any,
    q: q || undefined,
    limit: 48,
  });

  useEffect(() => {
    const t = setInterval(() => refetch(), 10000);
    return () => clearInterval(t);
  }, [refetch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchInput);
  };

  return (
    <div className="min-h-full">
      {/* Tab switcher */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-2">
        <div className="flex gap-2 max-w-5xl mx-auto">
          <button
            onClick={() => setTab("merch")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-1 justify-center",
              tab === "merch" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <ShoppingBag size={15} />
            Merch
          </button>
          <button
            onClick={() => setTab("auctions")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-1 justify-center",
              tab === "auctions" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Gavel size={15} />
            Auctions
          </button>
          <button
            onClick={() => setTab("shop")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-1 justify-center",
              tab === "shop" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Star size={15} />
            Shop
          </button>
        </div>
      </div>

      {/* Merch tab */}
      {tab === "merch" && <MerchMarketplace />}

      {/* Shop tab */}
      {tab === "shop" && <AffiliateMarketplace />}

      {/* Auctions tab */}
      {tab === "auctions" && (
      <div>
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-primary/8 via-transparent to-transparent border-b border-border/40 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gavel size={20} className="text-primary" />
                <h1 className="text-xl font-black">Auction House</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">LIVE</span>
              </div>
              <p className="text-xs text-muted-foreground">Creator drops, collectibles & exclusive experiences</p>
            </div>
            {user && (
              <button
                onClick={() => navigate("/create-auction")}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus size={13} />
                List Item
              </button>
            )}
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search auctions..."
              className="w-full pl-8 pr-4 py-2.5 bg-background/80 border border-border/60 rounded-xl text-sm focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
            />
          </form>

          {/* Sort tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={cn(
                  "flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                  sort === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Type filter */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide mb-1">
          {ITEM_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setItemType(t.value)}
              className={cn(
                "flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                itemType === t.value
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-transparent border-border/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          {(itemType || category !== "All") && (
            <button
              onClick={() => { setItemType(""); setCategory("All"); }}
              className="flex-shrink-0 text-xs font-semibold text-primary hover:underline ml-1 whitespace-nowrap"
            >
              View all →
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          <Package size={11} className="text-muted-foreground/60 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground/70">
            Selling merch?{" "}
            <Link href="/merch/create" className="text-primary hover:underline font-semibold">
              Create it in the SWEATHEORY shop →
            </Link>
          </p>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-5">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "flex-shrink-0 text-[11px] font-medium px-3 py-1 rounded-full transition-colors",
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/60",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/40 rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-muted/30" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-muted/30 rounded w-3/4" />
                  <div className="h-4 bg-muted/30 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-20">
            <Gavel size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No auctions found</p>
            {user && (
              <button onClick={() => navigate("/create-auction")} className="mt-4 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                List the first item
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {auctions.map((auction: any) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}

        {/* Shop promo strip */}
        <div className="mt-8 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-black flex items-center gap-2">
              <Star size={14} className="text-primary" />
              Sweatheory Shop
            </p>
            <button onClick={() => setTab("shop")} className="text-xs text-primary hover:underline font-semibold">Browse Shop →</button>
          </div>
          <button
            onClick={() => setTab("shop")}
            className="w-full relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/15 via-primary/5 to-purple-600/10 px-5 py-4 text-left hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-base mb-0.5">Partner Brands & Creator Picks</p>
                <p className="text-xs text-muted-foreground">Exclusive affiliate brands, wellness products & lifestyle drops</p>
              </div>
              <ShoppingBag size={28} className="text-primary/40 flex-shrink-0 ml-4" />
            </div>
          </button>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
