import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Check, Zap, Crown, Shield, Star, ArrowRight, HardDrive,
  Video, DollarSign, Sparkles, Radio, BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TIERS, TIER_ORDER, type AccountTier, tierColor } from "@/lib/tiers";

const TIER_ICONS: Record<AccountTier, React.ReactNode> = {
  free:    <Shield size={20} className="text-zinc-400" />,
  creator: <Zap    size={20} className="text-primary" />,
  pro:     <Crown  size={20} className="text-amber-400" />,
  elite:   <Star   size={20} className="text-rose-400" />,
};

const WHY_UPGRADE = [
  {
    icon: <HardDrive size={22} className="text-cyan-400" />,
    title: "More storage, more content",
    desc: "Upload longer videos, archive every stream, and never worry about running out of space.",
  },
  {
    icon: <Radio size={22} className="text-violet-400" />,
    title: "Higher quality, bigger audiences",
    desc: "Go live in 1080p or 4K, stream for hours, and bring more viewers on stage with you.",
  },
  {
    icon: <DollarSign size={22} className="text-emerald-400" />,
    title: "Keep more of every dollar",
    desc: "Lower platform fees mean more earnings from tips, sales, and wallet transfers.",
  },
];

function tierCardStyle(id: AccountTier) {
  if (id === "elite")   return { borderColor: "rgba(244,63,94,0.35)",    background: "rgba(244,63,94,0.03)"  };
  if (id === "pro")     return { borderColor: "rgba(245,158,11,0.35)",   background: "rgba(245,158,11,0.03)" };
  if (id === "creator") return { borderColor: "rgba(139,92,246,0.45)",   background: "rgba(139,92,246,0.04)" };
  return {};
}

function tierBadgeStyle(id: AccountTier) {
  if (id === "elite")   return { background: "linear-gradient(90deg,#be123c,#9f1239)", color: "#fff" };
  if (id === "pro")     return { background: "linear-gradient(90deg,#d97706,#b45309)", color: "#fff" };
  if (id === "creator") return { background: "linear-gradient(90deg,#7c3aed,#6366f1)", color: "#fff" };
  return {};
}

export default function Pricing() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTier = (user?.accountTier ?? "free") as AccountTier;

  async function handleUpgrade(tier: string) {
    if (!user) return;
    setUpgrading(tier);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}/upgrade`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setSuccess(tier);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        const data = await res.json();
        setError(data?.error ?? "Upgrade failed");
      }
    } catch {
      setError("Could not connect. Try again.");
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 md:pb-8">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-3 py-1.5 rounded-full mb-5">
          <Sparkles size={11} />
          PLANS & PRICING
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-4 leading-tight">
          Build your audience.<br />
          <span className="bg-gradient-to-r from-primary via-cyan-400 to-violet-400 bg-clip-text text-transparent">
            Keep more of what you earn.
          </span>
        </h1>
        <p className="text-muted-foreground text-base max-w-xl mx-auto leading-relaxed">
          Every tier can post content and receive tips. Upgrade for higher limits, lower fees, and more powerful tools.
        </p>
        {!user && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Link href="/register">
              <button className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-colors shadow-lg shadow-primary/25">
                Get started free
              </button>
            </Link>
            <Link href="/login">
              <button className="px-6 py-2.5 border border-border text-sm font-medium rounded-xl hover:bg-muted/50 transition-colors">
                Sign in
              </button>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg text-center">
          {error}
        </div>
      )}

      {/* Tier Cards — 1→2→4 cols */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-16">
        {TIERS.map((tier, i) => {
          const isCurrent  = currentTier === tier.id;
          const isUpgrade  = TIER_ORDER[tier.id as AccountTier] > TIER_ORDER[currentTier];
          const isDowngrade = TIER_ORDER[tier.id as AccountTier] < TIER_ORDER[currentTier];
          const isElite    = tier.id === "elite";
          const isPro      = tier.id === "pro";
          const isCreator  = tier.id === "creator";

          return (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className="relative flex flex-col rounded-2xl border p-6 transition-all"
              style={tierCardStyle(tier.id as AccountTier)}
            >
              {/* Badge */}
              {tier.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-black px-3 py-1 rounded-full whitespace-nowrap"
                  style={tierBadgeStyle(tier.id as AccountTier)}
                >
                  {tier.badge}
                </div>
              )}

              {/* Current plan pill */}
              {isCurrent && (
                <div className="absolute top-4 right-4 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                  Current plan
                </div>
              )}

              {/* Icon + name */}
              <div className="mb-5">
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center mb-3",
                  isElite ? "bg-rose-500/15" : isPro ? "bg-amber-500/15" : isCreator ? "bg-primary/15" : "bg-muted"
                )}>
                  {TIER_ICONS[tier.id as AccountTier]}
                </div>
                <h2 className={cn("text-xl font-black mb-1", tierColor(tier.id as AccountTier))}>{tier.name}</h2>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black">
                    {tier.price === 0 ? "$0" : `$${tier.price}`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tier.price === 0 ? `/ ${tier.period}` : `/ ${tier.period}`}
                  </span>
                </div>
                {isCreator && (
                  <p className="text-[11px] text-amber-400/80 mt-1 flex items-center gap-1">
                    <BadgeCheck size={11} /> Requires identity verification
                  </p>
                )}
              </div>

              {/* Key stats strip */}
              <div className="grid grid-cols-3 gap-0 mb-5 rounded-xl overflow-hidden border border-border/40">
                {[
                  { icon: <HardDrive size={11} />, val: tier.storageLabel, label: "Storage" },
                  { icon: <Video size={11} />,     val: tier.streaming,    label: "Quality" },
                  { icon: <DollarSign size={11} />, val: tier.fee,         label: "Fee" },
                ].map((stat, j) => (
                  <div key={j} className={cn("flex flex-col items-center py-2.5 px-1 bg-muted/20", j > 0 && "border-l border-border/40")}>
                    <div className="text-muted-foreground mb-0.5">{stat.icon}</div>
                    <div className="text-xs font-black">{stat.val}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Features list */}
              <ul className="space-y-2 flex-1 mb-6">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check
                      size={13}
                      className={cn("mt-0.5 flex-shrink-0", tierColor(tier.id as AccountTier))}
                    />
                    <span className="text-muted-foreground leading-tight">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center border border-green-500/20 text-green-400 bg-green-500/5">
                  ✓ Your current plan
                </div>
              ) : !user ? (
                <Link href="/register">
                  <button
                    className={cn(
                      "w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      isElite
                        ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                        : isPro
                          ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                          : isCreator
                            ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                            : "border border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    Get started <ArrowRight size={13} />
                  </button>
                </Link>
              ) : isUpgrade ? (
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={!!upgrading}
                  className={cn(
                    "w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60",
                    isElite
                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                      : isPro
                        ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                  )}
                >
                  {upgrading === tier.id
                    ? "Processing..."
                    : success === tier.id
                      ? "✓ Plan upgraded!"
                      : <><Zap size={13} /> Upgrade to {tier.name}</>
                  }
                </button>
              ) : isDowngrade ? (
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={!!upgrading}
                  className="w-full py-2.5 rounded-xl text-sm text-muted-foreground border border-border hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  {upgrading === tier.id ? "Processing..." : `Downgrade to ${tier.name}`}
                </button>
              ) : null}
            </motion.div>
          );
        })}
      </div>

      {/* Why upgrade */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-14"
      >
        <h2 className="text-xl font-black text-center mb-8">Why creators upgrade</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {WHY_UPGRADE.map((w, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              className="bg-card border border-border rounded-2xl p-5"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                {w.icon}
              </div>
              <h3 className="text-sm font-bold mb-1.5">{w.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{w.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Fee comparison */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-14 bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-base font-bold flex items-center gap-2">
            <DollarSign size={15} className="text-emerald-400" />
            Platform fee comparison
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Applied to all tips, sales, and wallet transfers</p>
        </div>
        <div className="divide-y divide-border/40">
          {TIERS.map(tier => {
            const feeNum = parseFloat(tier.fee);
            const barW = (feeNum / 15) * 100;
            return (
              <div key={tier.id} className="px-6 py-4 flex items-center gap-4">
                <div className={cn("w-20 text-sm font-bold flex-shrink-0", tierColor(tier.id as AccountTier))}>
                  {tier.name}
                </div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      tier.id === "elite" ? "bg-rose-500" :
                      tier.id === "pro"   ? "bg-amber-500" :
                      tier.id === "creator" ? "bg-primary" : "bg-zinc-500"
                    )}
                    style={{ width: `${barW}%` }}
                  />
                </div>
                <div className={cn("w-10 text-sm font-black text-right flex-shrink-0", tierColor(tier.id as AccountTier))}>
                  {tier.fee}
                </div>
                <div className="w-40 text-xs text-muted-foreground text-right flex-shrink-0 hidden sm:block">
                  {tier.id === "free"    && "Tips & subs 15%"}
                  {tier.id === "creator" && "Tips & subs 10%"}
                  {tier.id === "pro"     && "Tips & subs 8%"}
                  {tier.id === "elite"   && "Tips & subs 5%"}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Storage & limits comparison */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mb-14 bg-card border border-border rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-base font-bold flex items-center gap-2">
            <HardDrive size={15} className="text-cyan-400" />
            Storage & limits
          </h2>
        </div>
        <div className="divide-y divide-border/40">
          {[
            { label: "Total storage",     vals: ["500 MB", "2 GB",      "100 GB",     "500 GB"]   },
            { label: "Max per upload",    vals: ["250 MB", "1 GB",      "5 GB",       "10 GB"]    },
            { label: "Max video length",  vals: ["3 min",  "10 min",    "Unlimited",  "Unlimited"] },
            { label: "Livestream quality",vals: ["720p",   "1080p",     "4K",         "4K"]        },
            { label: "Max stream length", vals: ["1 hour", "4 hours",   "Unlimited",  "Unlimited"] },
            { label: "Stream archives",   vals: ["7 days", "30 days",   "Permanent",  "Permanent"] },
            { label: "Posts per day",     vals: ["3",      "Unlimited", "Unlimited",  "Unlimited"] },
          ].map(row => (
            <div key={row.label} className="px-6 py-3 grid grid-cols-5 items-center gap-2">
              <div className="text-sm text-muted-foreground col-span-1">{row.label}</div>
              {row.vals.map((v, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-sm font-semibold text-center",
                    i === 3 ? "text-rose-400" : i === 2 ? "text-amber-400" : i === 1 ? "text-primary" : "text-zinc-400"
                  )}
                >
                  {v}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-6 py-3 bg-muted/20 grid grid-cols-5 gap-2 border-t border-border/60">
          <div />
          {TIERS.map(t => (
            <div key={t.id} className={cn("text-[11px] font-black text-center uppercase tracking-wide", tierColor(t.id as AccountTier))}>
              {t.name}
            </div>
          ))}
        </div>
      </motion.div>

      {/* FAQ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mb-8"
      >
        <h2 className="text-xl font-black text-center mb-6">Common questions</h2>
        <div className="space-y-3">
          {[
            {
              q: "Can I change plans at any time?",
              a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.",
            },
            {
              q: "Why does Creator tier require identity verification?",
              a: "Creator tier is free but requires ID verification to unlock subscription features, storefronts, and unlimited posting. This protects creators and fans on the platform.",
            },
            {
              q: "Why is Free limited to 3 posts per day?",
              a: "The daily post limit encourages quality over quantity and helps prevent spam. Creator tier and above have unlimited daily posts.",
            },
            {
              q: "What happens to my content if I downgrade?",
              a: "Your existing content is preserved. However, you won't be able to upload new content that exceeds your new plan's limits until you clear space.",
            },
            {
              q: "Are platform fees applied to all wallet activity?",
              a: "Fees apply to outgoing tips, marketplace sales, and wallet withdrawals. Deposits into your wallet are always free.",
            },
            {
              q: "Is G Platform ad-free?",
              a: "Yes. G Platform is ad-free. Revenue comes from plan subscriptions and small platform fees, not advertising.",
            },
          ].map((faq, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl px-5 py-4">
              <p className="text-sm font-bold mb-1.5">{faq.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Bottom CTA */}
      {!user && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="text-center py-10 rounded-2xl border border-primary/20 bg-primary/5"
        >
          <h3 className="text-xl font-black mb-2">Ready to start creating?</h3>
          <p className="text-muted-foreground text-sm mb-6">Join Sweatheory free. Post content, receive tips, and grow your audience from day one.</p>
          <Link href="/register">
            <button className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-colors shadow-lg shadow-primary/25 flex items-center gap-2 mx-auto">
              <Zap size={15} />
              Create your free account
            </button>
          </Link>
        </motion.div>
      )}

    </div>
  );
}
