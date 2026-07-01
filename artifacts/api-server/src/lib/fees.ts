// Merch-specific payment processing and margin constants
export const CCBILL_RATE = 0.099;         // 9.9% CCBill processing rate (launch tier)
export const CCBILL_FLAT = 0.35;          // CCBill per-transaction flat fee (dollars)
export const MERCH_CREATOR_SHARE = 0.70;  // Creator's share of margin after costs
export const MERCH_FLOOR_MULT = 2.0;      // Retail floor = this × highest variant Printify cost

// Platform fee rates by account tier
// TX fees: applied to tips, marketplace, auctions, stream tips, withdrawals
// Sub fees: applied to monthly subscription payments (platform cut)

export const TX_FEE_RATES: Record<string, number> = {
  free:    0.15,
  creator: 0.10,
  pro:     0.08,
  elite:   0.05,
};

export const SUB_FEE_RATES: Record<string, number> = {
  free:    0.15,
  creator: 0.10,
  pro:     0.08,
  elite:   0.05,
};

export function getTxFeeRate(accountTier: string | null | undefined): number {
  return TX_FEE_RATES[accountTier ?? "free"] ?? TX_FEE_RATES.free;
}

export function getSubFeeRate(accountTier: string | null | undefined): number {
  return SUB_FEE_RATES[accountTier ?? "free"] ?? SUB_FEE_RATES.free;
}

// Storage limits in bytes per tier
export const TIER_STORAGE_BYTES: Record<string, number> = {
  free:    500 * 1024 * 1024,
  creator: 2   * 1024 * 1024 * 1024,
  pro:     100 * 1024 * 1024 * 1024,
  elite:   500 * 1024 * 1024 * 1024,
};

export function getStorageLimit(accountTier: string | null | undefined): number {
  return TIER_STORAGE_BYTES[accountTier ?? "free"] ?? TIER_STORAGE_BYTES.free;
}

// Max single-file upload size per tier
export const MAX_UPLOAD_BYTES: Record<string, number> = {
  free:    250  * 1024 * 1024,       // 250 MB
  creator: 1    * 1024 * 1024 * 1024, // 1 GB
  pro:     5    * 1024 * 1024 * 1024, // 5 GB
  elite:   10   * 1024 * 1024 * 1024, // 10 GB
};

export function getMaxUploadSize(accountTier: string | null | undefined): number {
  return MAX_UPLOAD_BYTES[accountTier ?? "free"] ?? MAX_UPLOAD_BYTES.free;
}

// Tiers that can enable creator subscriptions (charge fans)
export const SUBSCRIPTION_ELIGIBLE_TIERS = new Set(["creator", "pro", "elite"]);

// Daily post limits per tier (null = unlimited)
export const DAILY_POST_LIMITS: Record<string, number | null> = {
  free:    3,
  creator: null,
  pro:     null,
  elite:   null,
};

export function getDailyPostLimit(accountTier: string | null | undefined): number | null {
  const tier = accountTier ?? "free";
  const limit = DAILY_POST_LIMITS[tier];
  return limit === undefined ? (DAILY_POST_LIMITS.free ?? 3) : limit;
}
