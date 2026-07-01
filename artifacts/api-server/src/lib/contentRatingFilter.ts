import { and, type SQL } from "drizzle-orm";

/**
 * Content-rating gating has been removed — the platform serves only general
 * ("safe") content, so these helpers are intentionally no-ops kept for
 * call-site compatibility.
 */
export function ratingFilter(
  _nsfwFilter: string | null | undefined,
  _verificationMethod: string | null | undefined,
): SQL | undefined {
  return undefined;
}

export function canViewRating(
  _contentRating: string | null | undefined,
  _nsfwFilter: string | null | undefined,
  _verificationMethod: string | null | undefined,
): boolean {
  return true;
}

/**
 * Composes an existing WHERE condition with the rating filter, handling the case
 * where either may be undefined.
 */
export function withRatingFilter(
  base: SQL | undefined,
  ratFilter: SQL | undefined,
): SQL | undefined {
  if (base && ratFilter) return and(base, ratFilter)!;
  return base ?? ratFilter;
}
