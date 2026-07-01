/**
 * Backfill muxAssetId on video posts that have muxPlaybackId but null muxAssetId.
 *
 * This fixes data left behind when muxAssetId was stripped by Zod during post creation
 * (it was not included in the PostInput OpenAPI schema at the time).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-mux-asset-ids
 *   pnpm --filter @workspace/scripts run backfill-mux-asset-ids -- --dry-run
 *
 * Requires: DATABASE_URL, MUX_TOKEN_ID, MUX_TOKEN_SECRET
 */

import Mux from "@mux/mux-node";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, isNull, isNotNull, eq } from "drizzle-orm";
import pg from "pg";
import { postsTable } from "@workspace/db";

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}
if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  console.error("ERROR: MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("--- DRY RUN MODE — no database changes will be written ---\n");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

// ── Step 1: Find posts that need backfilling ──────────────────────────────────

const posts = await db
  .select({ id: postsTable.id, muxPlaybackId: postsTable.muxPlaybackId })
  .from(postsTable)
  .where(
    and(
      eq(postsTable.type, "video"),
      isNotNull(postsTable.muxPlaybackId),
      isNull(postsTable.muxAssetId),
    ),
  );

if (posts.length === 0) {
  console.log("No posts need backfilling — all video posts already have muxAssetId set.");
  await pool.end();
  process.exit(0);
}

console.log(`Found ${posts.length} post(s) with muxPlaybackId but no muxAssetId.\n`);

// ── Step 2: Build a playbackId → assetId map from Mux ────────────────────────
//
// We paginate through all assets in the Mux account and collect their
// playback IDs. This avoids per-post API calls and works regardless of
// whether uploads were tracked.

console.log("Fetching Mux asset list (paginating)…");

const playbackToAsset = new Map<string, string>();
let page = 1;
let fetched = 0;

while (true) {
  const response = await mux.video.assets.list({ limit: 100, page });
  const assets = response.data ?? (response as any);

  if (!Array.isArray(assets) || assets.length === 0) break;

  for (const asset of assets) {
    if (!asset.id) continue;
    for (const pbId of asset.playback_ids ?? []) {
      if (pbId.id) {
        playbackToAsset.set(pbId.id, asset.id);
      }
    }
  }

  fetched += assets.length;
  console.log(`  … page ${page}: ${assets.length} assets (${fetched} total so far)`);

  if (assets.length < 100) break;
  page++;
}

console.log(`\nMapped ${playbackToAsset.size} playback ID(s) across ${fetched} Mux asset(s).\n`);

// ── Step 3: Update each post ──────────────────────────────────────────────────

let updated = 0;
let skipped = 0;
let notFound = 0;

for (const post of posts) {
  const playbackId = post.muxPlaybackId!;
  const assetId = playbackToAsset.get(playbackId);

  if (!assetId) {
    console.warn(`  [WARN] Post ${post.id}: playbackId ${playbackId} not found in Mux — skipping`);
    notFound++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Post ${post.id}: would set muxAssetId = ${assetId}`);
    updated++;
    continue;
  }

  await db
    .update(postsTable)
    .set({ muxAssetId: assetId })
    .where(eq(postsTable.id, post.id));

  console.log(`  ✓ Post ${post.id}: muxAssetId = ${assetId}`);
  updated++;
}

skipped = posts.length - updated - notFound;

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────
Backfill complete${DRY_RUN ? " (dry run)" : ""}.
  Updated : ${updated}
  Not found in Mux: ${notFound}
  Skipped : ${skipped}
─────────────────────────────────────────`);

await pool.end();
