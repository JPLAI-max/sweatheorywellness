import { useState, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetMerchProduct, useCreateMerchOrder, useListMerchProducts,
  getGetMerchProductQueryKey, getListMerchProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import {
  ArrowLeft, ShoppingCart, Check, X, Package, Truck,
  Shield, Flame, Crown, Star, Zap, ChevronRight, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_EMOJIS: Record<string, string> = {
  shirt: "👕", hoodie: "🧥", hat: "🧢", poster: "🖼️",
  sticker: "✨", mug: "☕", tote_bag: "👜", phone_case: "📱",
  vinyl_cover: "💿", sweatpants: "👖",
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function OrderModal({ product, onClose }: { product: any; onClose: () => void }) {
  const { user } = useCurrentUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [color, setColor] = useState(product.colors?.[0] ?? "");
  const [size, setSize] = useState(product.sizes?.[0] ?? "");
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState<"config" | "shipping" | "confirm" | "done">("config");
  const [shipping, setShipping] = useState({ name: "", address: "", city: "", state: "CA", zip: "", country: "US" });
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const createOrder = useCreateMerchOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMerchProductQueryKey(product.id) });
        setStep("done");
      },
      onError: (e: any) => setError(e?.response?.data?.error ?? "Order failed"),
    }
  });

  if (!user) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-2xl p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
        <p className="font-bold text-lg mb-2">Sign in to order</p>
        <p className="text-sm text-muted-foreground mb-4">You need an account to buy merch.</p>
        <Link href="/login"><button className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl">Sign In</button></Link>
      </div>
    </div>
  );

  const totalAmount = Number((product.basePrice * qty).toFixed(2));

  function placeOrder() {
    setError("");
    if (!shipping.name.trim() || !shipping.address.trim() || !shipping.city.trim() || !shipping.zip.trim()) {
      setError("Please fill out all shipping fields");
      return;
    }
    createOrder.mutate({
      data: {
        productId: product.id,
        color: color || undefined,
        size: size || undefined,
        quantity: qty,
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingZip: shipping.zip,
        shippingCountry: shipping.country,
        idempotencyKey: idempotencyKey.current,
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-md bg-card border border-card-border rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <div className="flex items-center gap-2.5">
            <ShoppingCart size={16} className="text-primary" />
            <h2 className="font-bold">Order Merch</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground"><X size={16} /></button>
        </div>

        <div className="p-5">
          {step === "done" ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <Check size={28} className="text-green-400" />
              </div>
              <p className="font-black text-xl mb-1">Order placed! 🎉</p>
              <p className="text-sm text-muted-foreground mb-5">
                Your order has been routed to our fulfillment partner for printing and shipping.
              </p>
              <div className="flex gap-2">
                <Link href="/merch/orders" className="flex-1">
                  <button className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm">Track Order</button>
                </Link>
                <button onClick={onClose} className="flex-1 py-3 bg-card border border-border font-semibold rounded-xl text-sm hover:bg-muted/60 transition-colors">Close</button>
              </div>
            </div>
          ) : step === "config" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-muted/40 flex items-center justify-center text-2xl flex-shrink-0">
                  {TYPE_EMOJIS[product.productType] ?? "🛍️"}
                </div>
                <div>
                  <p className="font-bold">{product.title}</p>
                  <p className="text-sm text-primary font-semibold">${Number(product.basePrice).toFixed(2)}</p>
                </div>
              </div>

              {product.colors?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c: string) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn("w-8 h-8 rounded-full border-2 transition-all", color === c ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border/60")}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}

              {product.sizes?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">Size</p>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map((s: string) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(s)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl border-2 text-sm font-semibold transition-all",
                          size === s ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">Quantity</p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 font-bold">−</button>
                  <span className="text-base font-bold w-6 text-center">{qty}</span>
                  <button type="button" onClick={() => setQty(q => Math.min(10, q + 1))} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 font-bold">+</button>
                </div>
              </div>

              <div className="bg-muted/30 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-black text-primary">${totalAmount.toFixed(2)}</span>
              </div>

              <button
                onClick={() => setStep("shipping")}
                className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                Continue to Shipping <ChevronRight size={15} />
              </button>
            </div>
          ) : step === "shipping" ? (
            <form onSubmit={e => { e.preventDefault(); setStep("confirm"); }} className="space-y-3">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">Shipping Address</p>
              <input required value={shipping.name} onChange={e => setShipping(p => ({...p, name: e.target.value}))} placeholder="Full name" className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <input required value={shipping.address} onChange={e => setShipping(p => ({...p, address: e.target.value}))} placeholder="Street address" className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="grid grid-cols-2 gap-2">
                <input required value={shipping.city} onChange={e => setShipping(p => ({...p, city: e.target.value}))} placeholder="City" className="bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                <select value={shipping.state} onChange={e => setShipping(p => ({...p, state: e.target.value}))} className="bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  {US_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <input required value={shipping.zip} onChange={e => setShipping(p => ({...p, zip: e.target.value}))} placeholder="ZIP code" className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setStep("config")} className="flex-1 py-3 bg-card border border-border font-semibold rounded-xl text-sm hover:bg-muted/60 transition-colors">Back</button>
                <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors">Review Order</button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Order Summary</p>
              <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">{product.title}</span><span className="font-semibold">${totalAmount.toFixed(2)}</span></div>
                {color && <div className="flex justify-between"><span className="text-muted-foreground">Color</span><span>{color}</span></div>}
                {size && <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{size}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{qty}</span></div>
                <hr className="border-border/60" />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">${totalAmount.toFixed(2)}</span></div>
              </div>
              <div className="bg-muted/20 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">{shipping.name}</p>
                <p>{shipping.address}</p>
                <p>{shipping.city}, {shipping.state} {shipping.zip}</p>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <label className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="mt-0.5 accent-amber-500 shrink-0"
                />
                <span className="text-xs text-amber-200/90 leading-relaxed">
                  <span className="font-bold text-amber-400">All sales final.</span>{" "}
                  I understand custom merch is made to order and all sales are final except for defects or items not delivered.
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("shipping")} className="flex-1 py-3 bg-card border border-border font-semibold rounded-xl text-sm hover:bg-muted/60 transition-colors">Edit</button>
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={createOrder.isPending || !acknowledged}
                  className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createOrder.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  {createOrder.isPending ? "Placing..." : "Place Order"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">Funds deducted from your Sweatheory wallet</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function MerchProduct() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const [, setLocation] = useLocation();
  const { user } = useCurrentUser();
  const [showOrder, setShowOrder] = useState(false);

  const { data: product, isLoading } = useGetMerchProduct(productId, {
    query: { queryKey: getGetMerchProductQueryKey(productId) }
  });

  const { data: relatedData } = useListMerchProducts(
    { limit: 4, offset: 0, ...(product ? { productType: (product as any).productType } : {}) },
    { query: { enabled: !!product, queryKey: getListMerchProductsQueryKey({ limit: 4, offset: 0, productType: (product as any)?.productType }) } }
  );

  const related = (Array.isArray(relatedData) ? relatedData : []).filter((p: any) => p.id !== productId).slice(0, 4);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-32" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-muted/30 rounded-2xl" />
            <div className="space-y-4">
              <div className="h-8 bg-muted/30 rounded w-3/4" />
              <div className="h-10 bg-muted/30 rounded w-1/4" />
              <div className="h-20 bg-muted/30 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Product not found</p>
        <Link href="/merch"><button className="mt-4 text-sm text-primary hover:underline">Back to Merch</button></Link>
      </div>
    );
  }

  const p = product as any;
  const emoji = TYPE_EMOJIS[p.productType] ?? "🛍️";
  const isOwner = user && (user as any).id === p.creatorId;
  const isPending = p.scanStatus && p.scanStatus !== 'clean';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/merch">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={14} /> Merch Store
        </button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Product Mockup */}
        <div className="space-y-3">
          <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-muted/60 to-muted/20 border border-border/60">
            {p.previewImageUrl ? (
              <img src={p.previewImageUrl} alt={p.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <span className="text-8xl select-none">{emoji}</span>
                {p.designUrl && (
                  <div className="w-32 h-32 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-white/5">
                    <img src={p.designUrl} alt="design" className="w-full h-full object-contain p-2" />
                  </div>
                )}
              </div>
            )}
            {p.isLimitedDrop && (
              <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold">
                <Flame size={11} /> Limited Drop
              </div>
            )}
            {p.isFeatured && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold">
                <Crown size={11} /> Featured
              </div>
            )}
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Package size={13} />, text: "POD Fulfilled" },
              { icon: <Truck size={13} />, text: "Ships in 5-7 days" },
              { icon: <Shield size={13} />, text: "Quality Guarantee" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex flex-col items-center gap-1 bg-muted/20 rounded-xl py-2.5 px-2 text-center">
                <span className="text-primary">{icon}</span>
                <span className="text-[10px] text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div className="space-y-5">
          <div>
            <p className="text-xs text-muted-foreground capitalize mb-1">{p.productType?.replace("_", " ")}</p>
            <h1 className="text-2xl font-black leading-tight mb-2">{p.title}</h1>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black text-primary">${Number(p.basePrice).toFixed(2)}</span>
              {p.salesCount > 0 && (
                <span className="text-sm text-muted-foreground">{p.salesCount} sold</span>
              )}
            </div>
          </div>

          {p.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
          )}

          {/* Creator */}
          {p.creator && (
            <Link href={`/profile/${p.creator.username}`}>
              <div className="flex items-center gap-3 bg-muted/20 rounded-2xl p-3 hover:bg-muted/30 transition-colors cursor-pointer">
                <Avatar user={p.creator} size="sm" />
                <div>
                  <p className="text-xs text-muted-foreground">Creator</p>
                  <p className="text-sm font-bold">@{p.creator.username}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground ml-auto" />
              </div>
            </Link>
          )}

          {/* Colors preview */}
          {p.colors?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Available Colors</p>
              <div className="flex flex-wrap gap-2">
                {p.colors.map((c: string) => (
                  <div key={c} className="w-7 h-7 rounded-full border-2 border-border/60 ring-1 ring-black/10" style={{ backgroundColor: c }} title={c} />
                ))}
              </div>
            </div>
          )}

          {/* Sizes preview */}
          {p.sizes?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Available Sizes</p>
              <div className="flex flex-wrap gap-2">
                {p.sizes.map((s: string) => (
                  <span key={s} className="px-3 py-1.5 bg-muted/30 border border-border/60 rounded-lg text-sm font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {p.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map((t: string) => (
                <span key={t} className="text-xs px-2 py-0.5 bg-muted/30 rounded-full text-muted-foreground">#{t}</span>
              ))}
            </div>
          )}

          {/* Action */}
          {isOwner && isPending && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-amber-400">Under review</p>
              <p className="text-xs text-muted-foreground mt-1">Your design is being scanned for safety. It will appear in the store once approved.</p>
            </div>
          )}
          {isOwner ? (
            <div className="bg-muted/20 border border-border/60 rounded-2xl p-4 text-center text-sm text-muted-foreground">
              This is your product.
              <Link href="/merch/orders">
                <button className="block mt-2 text-primary hover:underline text-xs">View your sales →</button>
              </Link>
            </div>
          ) : (
            <button
              onClick={() => setShowOrder(true)}
              className="w-full flex items-center justify-center gap-2.5 py-4 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 text-base"
            >
              <ShoppingCart size={18} />
              Order Now
            </button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Printed and shipped by our fulfillment partner. Allow 5–7 business days.
          </p>
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <div>
          <h2 className="font-black text-lg mb-4">More like this</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((r: any) => (
              <Link key={r.id} href={`/merch/${r.id}`}>
                <div className="bg-card border border-card-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors cursor-pointer">
                  <div className="aspect-square bg-muted/30 flex items-center justify-center text-4xl">
                    {r.previewImageUrl
                      ? <img src={r.previewImageUrl} alt={r.title} className="w-full h-full object-cover" />
                      : TYPE_EMOJIS[r.productType] ?? "🛍️"
                    }
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-bold truncate">{r.title}</p>
                    <p className="text-xs text-primary font-semibold">${Number(r.basePrice).toFixed(2)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showOrder && <OrderModal product={product} onClose={() => setShowOrder(false)} />}
      </AnimatePresence>
    </div>
  );
}
