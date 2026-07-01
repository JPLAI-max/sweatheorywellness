---
name: Non-adult pivot (de-adultification)
description: What was intentionally left dormant vs. removed when GoonCity was pivoted from an adult to a clean creator platform.
---

# Non-adult pivot

The platform was pivoted from an adult creator platform to a clean (non-adult) one: all age verification, NSFW/explicit content features, adult framing/copy, and adult-specific legal pages were removed. All core features (posting, feed, streaming, tipping, wallet, shop/merch, marketplace, messaging, profiles, subscriptions, auctions) were kept. CSAM/child-safety code (csam.ts, liveScanner.ts, ncmec_reports, preservation_holds, scan_status pipeline) was deliberately KEPT — it is independent of nudity.

## Kept dormant on purpose (do NOT assume these are bugs)
- **DB schema** in `lib/db/` was not changed. Adult-era columns/tables remain (e.g. `isAgeVerified`, `isNsfwCreator`, content-rating enums, consent_records, performer_records). They are unused by UI/logic, not removed.
- **OpenAPI spec** (`lib/api-spec/openapi.yaml`) still documents removed adult-era surfaces: `/users/{userId}/verify-id`, `gooned` sort enum, and `nsfw`/`explicit`/`suggestive`/`mature` content-rating enums. Codegen was intentionally NOT re-run during the pivot. If you regenerate clients, these stale surfaces persist until the spec itself is cleaned.
- **Admin panel** (`artifacts/g/src/pages/Admin.tsx`, `routes/admin.ts`) left dormant — still renders NSFW/age-verified badges and a content-rating filter off dormant columns. Behind admin auth; not user-facing.

## Gotcha — adult UX hid in files outside the obvious list
**Why:** during the pivot, age-gating/adult UX was spread beyond the expected pages. `Explore.tsx` had its own self-contained `AgeGateModal` + `gc_age_verified` localStorage gate and a `💦 Gooned` sort tab that no task file list covered; it was only caught in code review.
**How to apply:** when doing platform-wide content/copy removals, grep the WHOLE `artifacts/g/src` tree (e.g. `age.?verif`, `gooned`, `nsfw`, `18\+`, `adults only`) rather than trusting a curated per-page file list. Self-contained modals/state can live in any page.

## Deferred follow-ups (not done)
- Light-theme rebrand (warm light palette + new logo/name). User declined the real "Sweatheory" name earlier. Brand tokens still read "GoonCity"/gooncity.net.
- Cleaning the OpenAPI spec + dormant DB columns if a true removal (not just deactivation) is ever wanted.
