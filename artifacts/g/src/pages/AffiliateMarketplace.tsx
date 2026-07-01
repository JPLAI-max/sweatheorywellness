import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ExternalLink, Star, Sparkles, ShoppingBag, Heart, Package, Zap, Shield, AlertCircle, RefreshCw, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const CATEGORIES = [
  { id: "all",       label: "All",           emoji: "✨" },
  { id: "wellness",  label: "Wellness",      emoji: "💆" },
  { id: "apparel",   label: "Apparel",       emoji: "👕" },
  { id: "tech",      label: "Tech",          emoji: "🎧" },
  { id: "lifestyle", label: "Lifestyle",     emoji: "🌙" },
  { id: "merch",     label: "Creator Picks", emoji: "⭐" },
];

interface ShopItem {
  id: number; type: string; title: string; subtitle: string | null;
  imageUrl: string | null; affiliateUrl: string | null;
  category: string | null; badge: string | null; commission: string | null;
  isActive: boolean; position: number; createdAt: string;
}

export default function AffiliateMarketplace() {
  const [category, setCategory] = useState("all");
  const { user } = useCurrentUser();
  const isAdmin = (user as any)?.isAdmin;

  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/shop-items", { credentials: "include" })
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const brands = items.filter(i => i.type === "brand" && (category === "all" || (i.category ?? "").toLowerCase() === category));
  const picks = items.filter(i => i.type === "creator_pick" && (category === "all" || (i.category ?? "").toLowerCase() === category));
  const hasItems = items.length > 0;

  return (
    <div className="pb-24">

      {/* ── Coming Soon Hero (only shown when no items) ─────────────────── */}
      {!loading && !hasItems && (
        <div className="mx-4 mt-4 mb-6 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-purple-600/10 p-8 text-center">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-16 translate-x-16 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-600/5 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={24} className="text-primary" />
            </div>
            <h2 className="text-2xl font-black mb-2">Shop Coming Soon</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-4 leading-relaxed">
              The Sweatheory Shop is being set up. Partner brands, creator picks, and exclusive drops will appear here once activated.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 w-fit mx-auto">
              <AlertCircle size={13} />
              <span>Payment processing setup in progress</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Disclaimer ──────────────────────────────────────────────────── */}
      <div className="mx-4 mb-5 mt-4 flex items-start gap-2.5 bg-muted/30 border border-border/50 rounded-xl px-4 py-3">
        <Shield size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          All products are sold and fulfilled by third-party partners. Sweatheory earns affiliate commissions on purchases but does not manufacture, warehouse, or ship any products. Vendor partners handle all fulfillment, returns, and compliance.
        </p>
      </div>

      {/* ── Category filter ─────────────────────────────────────────────── */}
      <div className="flex gap-2 px-4 overflow-x-auto scrollbar-none pb-1 mb-6">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-all flex-shrink-0",
              category === cat.id
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <span>{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Loading state ────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <RefreshCw size={15} className="animate-spin" />
          <span className="text-sm">Loading shop…</span>
        </div>
      )}

      {/* ── Featured Brands ─────────────────────────────────────────────── */}
      {!loading && (
        <div className="px-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black flex items-center gap-2">
              <Star size={15} className="text-amber-400 fill-amber-400" />
              Featured Brands
            </h2>
            {isAdmin && (
              <Link href="/admin?tab=shop">
                <button className="text-xs text-primary hover:underline font-semibold">+ Add Brand</button>
              </Link>
            )}
          </div>

          {brands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 bg-card border border-border/40 rounded-2xl text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                <Package size={20} className="text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No brands added yet</p>
              {isAdmin ? (
                <Link href="/admin?tab=shop">
                  <button className="text-xs text-primary hover:underline">Add partner brands from the admin panel →</button>
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground/60">Check back soon for partner brand drops</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {brands.map(brand => (
                <motion.a
                  key={brand.id}
                  href={brand.affiliateUrl ?? "#"}
                  target={brand.affiliateUrl ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group flex items-center gap-4 bg-card border border-border/60 rounded-2xl p-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted/40 flex-shrink-0">
                    {brand.imageUrl ? (
                      <img src={brand.imageUrl} alt={brand.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag size={20} className="text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-sm truncate">{brand.title}</p>
                      {brand.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/20 text-primary flex-shrink-0">{brand.badge}</span>
                      )}
                    </div>
                    {brand.subtitle && <p className="text-xs text-muted-foreground truncate">{brand.subtitle}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      {brand.category && <span className="text-[10px] text-muted-foreground/70">{brand.category}</span>}
                    </div>
                  </div>
                  <ExternalLink size={13} className="text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                </motion.a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Creator Picks ────────────────────────────────────────────────── */}
      {!loading && (
        <div className="mb-8">
          <div className="flex items-center justify-between px-4 mb-4">
            <h2 className="text-base font-black flex items-center gap-2">
              <Heart size={15} className="text-rose-400 fill-rose-400" />
              Creator Picks
            </h2>
            {isAdmin && (
              <Link href="/admin?tab=shop">
                <button className="text-xs text-primary hover:underline font-semibold">+ Add Pick</button>
              </Link>
            )}
          </div>

          {picks.length === 0 ? (
            <div className="mx-4 flex flex-col items-center justify-center py-14 bg-card border border-border/40 rounded-2xl text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                <Sparkles size={20} className="text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No creator picks yet</p>
              {isAdmin ? (
                <Link href="/admin?tab=shop">
                  <button className="text-xs text-primary hover:underline">Curate creator picks from the admin panel →</button>
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground/60">Creator-curated products coming soon</p>
              )}
            </div>
          ) : (
            <div className="flex gap-3 px-4 overflow-x-auto pb-2 scrollbar-none">
              {picks.map(pick => (
                <motion.a
                  key={pick.id}
                  href={pick.affiliateUrl ?? "#"}
                  target={pick.affiliateUrl ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group flex-shrink-0 w-44 bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-primary/40 transition-all"
                >
                  <div className="aspect-square bg-muted/40 overflow-hidden">
                    {pick.imageUrl ? (
                      <img src={pick.imageUrl} alt={pick.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles size={24} className="text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold truncate mb-0.5">{pick.title}</p>
                    {pick.subtitle && <p className="text-[10px] text-muted-foreground truncate">{pick.subtitle}</p>}
                    <div className="flex items-center gap-1 mt-1.5">
                      <Globe size={9} className="text-muted-foreground/50" />
                      <span className="text-[9px] text-muted-foreground/50 truncate">{pick.affiliateUrl ? new URL(pick.affiliateUrl).hostname.replace("www.", "") : "Shop"}</span>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Become a Vendor CTA ─────────────────────────────────────────── */}
      <div className="mx-4 bg-gradient-to-br from-card to-muted/20 border border-border rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <Package size={20} className="text-primary" />
        </div>
        <h3 className="text-base font-black mb-1">Partner with Sweatheory</h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Are you a brand looking to reach thousands of creators and their fans? Apply for a sponsored placement or affiliate partnership.
        </p>
        <a
          href="mailto:partners@sweatheory.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-colors"
        >
          <Zap size={14} />
          Apply as a Partner
        </a>
      </div>
    </div>
  );
}
