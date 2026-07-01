---
name: CSAM scan-status filter decisions
description: Per-table scan_status read-filter pattern and why they differ — needed by anyone adding new routes or tables.
---

# CSAM scan_status filter pattern per table

| Table | Read filter | Rationale |
|-------|-------------|-----------|
| posts | `ne(scanStatus, 'blocked')` | Shows pending (visible while scanner processes), hides only blocked |
| dm_messages | media URL set to null unless scanStatus='clean' | Message text always visible; media gated until clean |
| merch_products | `eq(scanStatus, 'clean')` | Strict — merch not visible at all until scanned clean |
| auctions | `eq(scanStatus, 'clean')` | Strict — auction not visible at all until scanned clean |
| streams (recording) | `muxAssetId` exposed only when scanStatus='clean' (enrichStreams) | Recording VOD never served until clean |

**Why posts use !=blocked (not strict):** a prod backfill gap caused all posts to disappear when strict =clean was used; social content visibility is more forgiving than commercial listings.

**Why merch/auctions use strict =clean:** they are commercial listings; showing pending stock causes customer confusion and potential fraud.

## Mutation response pattern

`PATCH /posts/:postId` re-quarantines to `pending` when media fields change, then must call `enrichPosts(..., { bypassScanFilter: true })` so the owner gets a valid response. Media fields are individually gated inside `enrichPosts` via `p.scanStatus === 'clean'` checks — no raw media leaks out.

**Why:** enrichPosts top-level filter drops non-clean posts entirely; without bypass the PATCH response is undefined.
