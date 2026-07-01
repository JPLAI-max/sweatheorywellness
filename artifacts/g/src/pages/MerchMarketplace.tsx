import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useListMerchProducts, getListMerchProductsQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Shirt, PlusCircle, Flame, Sparkles, Star, ShoppingBag, Tag, Zap, Crown, Package, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShopItem {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  affiliateUrl: string | null;
  badge: string | null;
  category: string | null;
}


const PRODUCT_TYPES = [
  { value: "", label: "All", icon: ShoppingBag },
  { value: "shirt", label: "Shirts", icon: Shirt },
  { value: "hoodie", label: "Hoodies", icon: Shirt },
  { value: "hat", label: "Hats", icon: Tag },
  { value: "poster", label: "Posters", icon: Star },
  { value: "sticker", label: "Stickers", icon: Sparkles },
  { value: "mug", label: "Mugs", icon: Package },
  { value: "tote_bag", label: "Totes", icon: ShoppingBag },
  { value: "phone_case", label: "Phone Cases", icon: Zap },
  { value: "vinyl_cover", label: "Vinyl", icon: Star },
  { value: "sweatpants", label: "Sweats", icon: Shirt },
];

const TYPE_EMOJIS: Record<string, string> = {
  shirt: "👕", hoodie: "🧥", hat: "🧢", poster: "🖼️",
  sticker: "✨", mug: "☕", tote_bag: "👜", phone_case: "📱",
  vinyl_cover: "💿", sweatpants: "👖",
};

function ProductCard({ product }: { product: any }) {
  const emoji = TYPE_EMOJIS[product.productType] ?? "🛍️";

  return (
    <Link href={`/merch/${product.id}`}>
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="group bg-card border border-card-border rounded-2xl overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
      >
        <div className="relative aspect-square bg-gradient-to-br from-muted/60 to-muted/20 overflow-hidden">
          {product.previewImageUrl ? (
            <img src={product.previewImageUrl} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <span className="text-6xl select-none">{emoji}</span>
              {product.designUrl && (
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                  <img src={product.designUrl} alt="design" className="w-full h-full object-contain bg-white/5" />
                </div>
              )}
            </div>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.isFeatured && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400">
                <Crown size={9} /> Featured
              </span>
            )}
            {product.isLimitedDrop && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-red-400">
                <Flame size={9} /> Limited
              </span>
            )}
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <div className="p-3">
          <p className="text-xs text-muted-foreground mb-0.5 capitalize">{product.productType?.replace("_", " ")}</p>
          <p className="text-sm font-bold truncate mb-1">{product.title}</p>

          {product.creator && (
            <p className="text-xs text-muted-foreground truncate mb-2">
              by <span className="text-primary">@{product.creator.username}</span>
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-base font-black text-primary">${Number(product.basePrice).toFixed(2)}</span>
            {product.salesCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{product.salesCount} sold</span>
            )}
          </div>

          {product.colors && product.colors.length > 0 && (
            <div className="flex gap-1 mt-2">
              {product.colors.slice(0, 5).map((c: string) => (
                <div key={c} className="w-3.5 h-3.5 rounded-full border border-white/20 ring-1 ring-black/20" style={{ backgroundColor: c }} title={c} />
              ))}
              {product.colors.length > 5 && <span className="text-[10px] text-muted-foreground">+{product.colors.length - 5}</span>}
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

function StoreItemCard({ item }: { item: ShopItem }) {
  const [imgFailed, setImgFailed] = useState(false);

  const inner = (
    <motion.div
      whileHover={{ y: -3, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="flex-shrink-0 w-36 bg-card border border-card-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors cursor-pointer"
    >
      <div className="relative aspect-square overflow-hidden bg-muted/30">
        {item.imageUrl && !imgFailed ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl select-none">🛍️</span>
          </div>
        )}
        {item.badge && (
          <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md border text-primary bg-primary/15 border-primary/20">
            {item.badge}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold truncate leading-tight mb-0.5">{item.title}</p>
        {item.subtitle && (
          <p className="text-sm font-black text-primary">{item.subtitle}</p>
        )}
      </div>
    </motion.div>
  );

  if (item.affiliateUrl) {
    return <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  return <Link href="/marketplace?tab=shop">{inner}</Link>;
}

export default function MerchMarketplace() {
  const [activeType, setActiveType] = useState("");
  const { user } = useCurrentUser();
  const [shopItems, setShopItems] = useState<ShopItem[] | null>(null);

  useEffect(() => {
    fetch("/api/shop-items", { credentials: "include" })
      .then(r => r.json())
      .then(data => setShopItems(Array.isArray(data) ? data : []))
      .catch(() => setShopItems([]));
  }, []);

  const params = {
    limit: 48,
    offset: 0,
    ...(activeType ? { productType: activeType } : {}),
  };

  const { data, isLoading } = useListMerchProducts(params, {
    query: { queryKey: getListMerchProductsQueryKey(params), staleTime: 30000 }
  });

  const products = Array.isArray(data) ? data : [];
  const featured = products.filter((p: any) => p.isFeatured);
  const drops = products.filter((p: any) => p.isLimitedDrop);

  const displayItems = shopItems && shopItems.length > 0 ? shopItems : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* ── Sweatheory Official Store — only shown when admin has added items ── */}
      {displayItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <Star size={13} className="text-primary" />
              </div>
              <h2 className="font-black text-lg">Sweatheory Official Store</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 border border-primary/20 text-primary">OFFICIAL</span>
            </div>
            <Link href="/marketplace?tab=shop" className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold">
              View all <ExternalLink size={11} />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {displayItems.slice(0, 8).map((item) => (
              <StoreItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {displayItems.length > 0 && <div className="border-t border-border/40" />}

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-purple-600/10 border border-primary/20 p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-20 translate-x-20" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600/5 rounded-full translate-y-12 -translate-x-12" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <ShoppingBag size={16} className="text-primary" />
            </div>
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Creator Merch</span>
          </div>
          <h1 className="text-3xl font-black mb-2">Turn your brand<br />into a revenue stream.</h1>
          <p className="text-muted-foreground text-sm mb-5 max-w-md">
            Make exclusive merch for your favorite fans — print-on-demand, no inventory, shipped direct.
          </p>
          <div className="flex flex-wrap gap-3">
            {user && (
              <Link href="/merch/create">
                <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                  <PlusCircle size={15} />
                  Create Merch
                </button>
              </Link>
            )}
            <Link href="/merch/orders">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-muted/60 transition-colors text-sm">
                <Package size={15} />
                My Orders
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Type Filter ── */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {PRODUCT_TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveType(value)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors",
              activeType === value
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Limited Drops */}
      {drops.length > 0 && !activeType && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Flame size={16} className="text-red-400" />
            <h2 className="font-black text-lg">Limited Drops</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/20 text-red-400">EXCLUSIVE</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {drops.slice(0, 5).map((p: any) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && !activeType && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Crown size={16} className="text-amber-400" />
            <h2 className="font-black text-lg">Featured Drops</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {featured.slice(0, 5).map((p: any) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* All Products */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">
            {activeType ? PRODUCT_TYPES.find(t => t.value === activeType)?.label : "All Products"}
          </h2>
          <div className="flex items-center gap-3">
            {activeType && (
              <button onClick={() => setActiveType("")} className="text-xs text-primary hover:underline font-semibold">
                View all →
              </button>
            )}
            {!isLoading && <span className="text-sm text-muted-foreground">{products.length} products</span>}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-card border border-card-border rounded-2xl overflow-hidden">
                <div className="aspect-square bg-muted/40" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-muted/40 rounded w-1/2" />
                  <div className="h-4 bg-muted/40 rounded w-3/4" />
                  <div className="h-3 bg-muted/40 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-card border border-card-border rounded-2xl">
            <ShoppingBag size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {activeType ? `No ${PRODUCT_TYPES.find(t => t.value === activeType)?.label?.toLowerCase()} yet` : "No products yet"}
            </p>
            {activeType && (
              <button onClick={() => setActiveType("")} className="mt-2 text-sm text-primary hover:underline">
                View all products →
              </button>
            )}
            {user && !activeType && (
              <Link href="/merch/create">
                <button className="mt-3 text-sm text-primary hover:underline">Be the first to create merch →</button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((p: any) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Shop promo strip */}
      <Link href="/marketplace?tab=shop">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/15 via-primary/5 to-purple-600/10 px-5 py-4 hover:border-primary/40 transition-colors cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Sweatheory Shop</p>
              <p className="font-black text-base mb-0.5">Partner Brands & Creator Picks</p>
              <p className="text-xs text-muted-foreground">Exclusive affiliate brands, wellness products & lifestyle drops</p>
            </div>
            <ShoppingBag size={28} className="text-primary/40 flex-shrink-0 ml-4" />
          </div>
        </div>
      </Link>

      {/* CTA */}
      {user && (
        <div className="mt-4 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-lg">Ready to sell your merch?</p>
            <p className="text-sm text-muted-foreground">Upload your design, set your price, and start selling — no inventory needed.</p>
          </div>
          <Link href="/merch/create" className="flex-shrink-0">
            <button className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm whitespace-nowrap">
              <PlusCircle size={15} />
              Create Now
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
