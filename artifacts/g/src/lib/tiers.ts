export type AccountTier = "free" | "creator" | "pro" | "elite";

export const TIER_ORDER: Record<AccountTier, number> = {
  free: 0, creator: 1, pro: 2, elite: 3,
};

export const TIER_STORAGE_BYTES: Record<AccountTier, number> = {
  free:    500 * 1024 * 1024,
  creator: 2   * 1024 * 1024 * 1024,
  pro:     100 * 1024 * 1024 * 1024,
  elite:   500 * 1024 * 1024 * 1024,
};

export const TIER_STORAGE_LABEL: Record<AccountTier, string> = {
  free:    "500 MB",
  creator: "2 GB",
  pro:     "100 GB",
  elite:   "500 GB",
};

export const TIER_STREAMING: Record<AccountTier, string> = {
  free:    "720p",
  creator: "1080p",
  pro:     "4K",
  elite:   "4K",
};

export const TIER_FEE: Record<AccountTier, string> = {
  free:    "15%",
  creator: "10%",
  pro:     "8%",
  elite:   "5%",
};

export const TIER_DAILY_POST_LIMIT: Record<AccountTier, number | null> = {
  free:    3,
  creator: null,
  pro:     null,
  elite:   null,
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function tierColor(tier: AccountTier): string {
  if (tier === "elite")   return "text-rose-400";
  if (tier === "pro")     return "text-amber-400";
  if (tier === "creator") return "text-primary";
  return "text-zinc-400";
}

export function tierBorderStyle(tier: AccountTier) {
  if (tier === "elite")   return { borderColor: "rgba(244,63,94,0.4)" };
  if (tier === "pro")     return { borderColor: "rgba(245,158,11,0.4)" };
  if (tier === "creator") return { borderColor: "rgba(var(--primary),0.5)" };
  return {};
}

export interface TierDef {
  id: AccountTier;
  name: string;
  price: number;
  period: string;
  storageLabel: string;
  streaming: string;
  fee: string;
  badge?: string;
  requiresIdVerification?: boolean;
  features: string[];
}

export const TIERS: TierDef[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    storageLabel: "500 MB",
    streaming: "720p",
    fee: "15%",
    features: [
      "500 MB total storage",
      "250 MB max per upload",
      "Videos up to 3 minutes",
      "720p livestream quality",
      "1-hour stream limit",
      "7-day stream archives",
      "15% platform fee",
      "Post content & receive tips",
      "3 posts per day limit",
      "All core social features",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    price: 0,
    period: "free",
    storageLabel: "2 GB",
    streaming: "1080p",
    fee: "10%",
    badge: "Free to join",
    requiresIdVerification: true,
    features: [
      "2 GB total storage",
      "1 GB max per upload",
      "Videos up to 10 minutes",
      "1080p livestream quality",
      "4-hour stream limit",
      "30-day stream archives",
      "10% platform fee",
      "Unlimited posts per day",
      "Creator storefront",
      "Subscription feature unlocked",
      "Identity verification required",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 19.99,
    period: "mo",
    storageLabel: "100 GB",
    streaming: "4K",
    fee: "8%",
    badge: "Most popular",
    features: [
      "100 GB total storage",
      "5 GB max per upload",
      "Unlimited video length",
      "4K livestreams, unlimited",
      "Permanent stream archives",
      "8% platform fee",
      "Advanced analytics",
      "Custom profile branding",
      "Priority support",
      "Premium discovery placement",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 49.99,
    period: "mo",
    storageLabel: "500 GB",
    streaming: "4K",
    fee: "5%",
    badge: "All-access",
    features: [
      "500 GB total storage",
      "10 GB max per upload",
      "Unlimited everything",
      "4K livestreams, unlimited",
      "Permanent stream archives",
      "5% platform fee",
      "Verified badge",
      "Featured in discovery",
      "Early access to new features",
      "Dedicated support",
      "All Pro features included",
    ],
  },
];
