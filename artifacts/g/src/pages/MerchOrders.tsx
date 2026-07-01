import { useState } from "react";
import { Link } from "wouter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { motion } from "framer-motion";
import { useGetMyMerchOrders, useGetMySales, getGetMyMerchOrdersQueryKey, getGetMySalesQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  Package, Truck, CheckCircle2, Clock, XCircle, ShoppingBag,
  ArrowLeft, DollarSign, BarChart2, TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  processing: { icon: <Clock size={12} />, color: "text-amber-400 bg-amber-400/10 border-amber-400/20", label: "Processing" },
  printing: { icon: <Package size={12} />, color: "text-blue-400 bg-blue-400/10 border-blue-400/20", label: "Printing" },
  shipped: { icon: <Truck size={12} />, color: "text-primary bg-primary/10 border-primary/20", label: "Shipped" },
  delivered: { icon: <CheckCircle2 size={12} />, color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Delivered" },
  cancelled: { icon: <XCircle size={12} />, color: "text-red-400 bg-red-400/10 border-red-400/20", label: "Cancelled" },
};

const TYPE_EMOJIS: Record<string, string> = {
  shirt: "👕", hoodie: "🧥", hat: "🧢", poster: "🖼️",
  sticker: "✨", mug: "☕", tote_bag: "👜", phone_case: "📱",
  vinyl_cover: "💿", sweatpants: "👖",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.processing;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.color)}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function OrderCard({ order, type }: { order: any; type: "purchase" | "sale" }) {
  const emoji = TYPE_EMOJIS[order.productType] ?? "🛍️";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-card-border rounded-2xl p-4 hover:border-primary/20 transition-colors"
    >
      <div className="flex gap-4">
        <div className="w-16 h-16 rounded-xl bg-muted/40 flex items-center justify-center text-3xl flex-shrink-0">
          {emoji}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link href={`/merch/${order.productId}`}>
              <p className="font-bold text-sm hover:text-primary transition-colors cursor-pointer truncate">{order.productTitle}</p>
            </Link>
            <StatusBadge status={order.status} />
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
            {order.color && <span>Color: <span className="text-foreground">{order.color}</span></span>}
            {order.size && <span>Size: <span className="text-foreground">{order.size}</span></span>}
            {order.quantity > 1 && <span>Qty: <span className="text-foreground">{order.quantity}</span></span>}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {type === "purchase" ? (
                <>
                  <span className="text-sm font-bold">${Number(order.totalAmount).toFixed(2)}</span>
                  {order.creator && (
                    <span className="text-xs text-muted-foreground">from <span className="text-primary">@{order.creator.username}</span></span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-green-400">+${Number(order.creatorPayout).toFixed(2)}</span>
                  {order.buyer && (
                    <span className="text-xs text-muted-foreground">by <span className="text-foreground">@{order.buyer.username}</span></span>
                  )}
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {order.createdAt ? formatDistanceToNow(new Date(order.createdAt), { addSuffix: true }) : ""}
            </span>
          </div>

          {order.trackingNumber && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-primary">
              <Truck size={11} />
              Tracking: <span className="font-mono">{order.trackingNumber}</span>
            </div>
          )}

          {type === "purchase" && (
            <div className="mt-2 text-xs text-muted-foreground">
              Ships to: {order.shippingName} · {order.shippingCity}, {order.shippingState}
            </div>
          )}
        </div>
      </div>

      {order.fulfillmentId && (
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
          <Package size={11} />
          Fulfillment ID: <span className="font-mono text-foreground">{order.fulfillmentId}</span>
        </div>
      )}
    </motion.div>
  );
}

export default function MerchOrders() {
  const isAuthed = useRequireAuth();

  const { user } = useCurrentUser();
  const [tab, setTab] = useState<"purchases" | "sales">("purchases");

  const { data: ordersData, isLoading: ordersLoading } = useGetMyMerchOrders({
    query: { queryKey: getGetMyMerchOrdersQueryKey() }
  });

  const { data: salesData, isLoading: salesLoading } = useGetMySales({
    query: { queryKey: getGetMySalesQueryKey() }
  });

  const orders = Array.isArray(ordersData) ? ordersData : [];
  const sales = Array.isArray(salesData) ? salesData : [];

  const totalSpent = orders.reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0);
  const totalEarned = sales.reduce((sum: number, s: any) => sum + Number(s.creatorPayout), 0);
  const totalSalesCount = sales.length;

  if (!isAuthed) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/merch">
          <button className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-black">My Merch</h1>
          <p className="text-xs text-muted-foreground">Orders & Sales</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-black">{orders.length}</p>
          <p className="text-xs text-muted-foreground">Purchases</p>
        </div>
        <div className="bg-card border border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-green-400">{sales.length}</p>
          <p className="text-xs text-muted-foreground">Items Sold</p>
        </div>
        <div className="bg-card border border-card-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-primary">${totalEarned.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Earned</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted/40 p-1 rounded-xl">
        <button
          onClick={() => setTab("purchases")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors",
            tab === "purchases" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ShoppingBag size={14} />
          Purchases {orders.length > 0 && <span className="text-xs bg-muted rounded-full px-1.5">{orders.length}</span>}
        </button>
        <button
          onClick={() => setTab("sales")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors",
            tab === "sales" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <TrendingUp size={14} />
          Sales {sales.length > 0 && <span className="text-xs bg-muted rounded-full px-1.5">{sales.length}</span>}
        </button>
      </div>

      {/* Content */}
      {tab === "purchases" ? (
        ordersLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-card border border-card-border rounded-2xl p-4 flex gap-4">
                <div className="w-16 h-16 bg-muted/40 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted/40 rounded w-2/3" />
                  <div className="h-3 bg-muted/40 rounded w-1/2" />
                  <div className="h-3 bg-muted/40 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <ShoppingBag size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground mb-1">No purchases yet</p>
            <p className="text-sm text-muted-foreground mb-4">Browse the merch store to find creator goods</p>
            <Link href="/merch">
              <button className="text-sm text-primary hover:underline">Explore Merch →</button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o: any) => <OrderCard key={o.id} order={o} type="purchase" />)}
          </div>
        )
      ) : (
        salesLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="animate-pulse bg-card border border-card-border rounded-2xl p-4 flex gap-4">
                <div className="w-16 h-16 bg-muted/40 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted/40 rounded w-2/3" />
                  <div className="h-3 bg-muted/40 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <TrendingUp size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground mb-1">No sales yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create merch to start earning</p>
            <Link href="/merch/create">
              <button className="text-sm text-primary hover:underline">Create Merch →</button>
            </Link>
          </div>
        ) : (
          <>
            {/* Earnings summary */}
            <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={16} className="text-primary" />
                <p className="font-bold">Creator Earnings</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-black text-green-400">${totalEarned.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total earned</p>
                </div>
                <div>
                  <p className="text-xl font-black">{totalSalesCount}</p>
                  <p className="text-xs text-muted-foreground">Orders</p>
                </div>
                <div>
                  <p className="text-xl font-black text-primary">${(totalEarned / Math.max(1, totalSalesCount)).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Avg. payout</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {sales.map((s: any) => <OrderCard key={s.id} order={s} type="sale" />)}
            </div>
          </>
        )
      )}

      {/* Create CTA */}
      <div className="mt-8 text-center">
        <Link href="/merch/create">
          <button className="text-sm text-primary hover:underline">+ Create a new product</button>
        </Link>
      </div>
    </div>
  );
}
