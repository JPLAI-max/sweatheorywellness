import app from "./app";
import { logger } from "./lib/logger";
import { attachSignaling } from "./lib/webrtc-signaling";
import { runBillingTick } from "./lib/billing";
import { runAuctionSettlementSweep } from "./lib/auctionSettlement";
import { startMuxOrphanCleanupScheduler, startMuxErroredAssetSweepScheduler } from "./lib/muxCleanup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

attachSignaling(server);

// ── Mux orphan cleanup scheduler ──────────────────────────────────────────
// Periodically deletes Mux uploads and assets that were never attached to a
// post (abandoned mid-upload). Runs every hour by default; configurable via
// MUX_CLEANUP_INTERVAL_MS and MUX_ORPHAN_THRESHOLD_HOURS.
startMuxOrphanCleanupScheduler();

// ── Mux errored-asset & errored-upload daily sweep ─────────────────────────
// Queries the Mux API directly for errored assets and errored/expired uploads
// that may have slipped through webhook delivery. Runs every 24 h by default;
// configurable via MUX_ERRORED_SWEEP_INTERVAL_MS.
startMuxErroredAssetSweepScheduler();

// ── Recurring billing scheduler ───────────────────────────────────────────
// Run once shortly after startup (give the DB connection pool a moment to warm up),
// then every hour. The tick is idempotent — it only processes subs whose period has ended.
const BILLING_TICK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

setTimeout(() => {
  runBillingTick().catch(err => logger.error({ err }, "billing: initial tick failed"));
}, 5_000);

setInterval(() => {
  runBillingTick().catch(err => logger.error({ err }, "billing: scheduled tick failed"));
}, BILLING_TICK_INTERVAL_MS);

// ── Auction settlement scheduler ──────────────────────────────────────────
// Sweeps all "ended" auctions and settles each (charge winner, pay seller).
// The advisory lock inside runAuctionSettlementSweep ensures only one sweep
// runs at a time. Manual-end route also triggers inline settlement immediately.
const AUCTION_SETTLEMENT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

setTimeout(() => {
  runAuctionSettlementSweep().catch(err => logger.error({ err }, "auction-settlement: initial sweep failed"));
}, 10_000);

setInterval(() => {
  runAuctionSettlementSweep().catch(err => logger.error({ err }, "auction-settlement: scheduled sweep failed"));
}, AUCTION_SETTLEMENT_INTERVAL_MS);
