import { db, auctionsTable, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { getTxFeeRate } from "./fees";
import { logger } from "./logger";

const AUCTION_SETTLEMENT_LOCK_KEY = sql`438571209348574::bigint`;

/**
 * Settle a single auction atomically.
 * - Row-locks the auction (FOR UPDATE) so concurrent calls are serialised.
 * - Idempotent: any status other than "ended" is a no-op.
 * - Possible outcomes: "sold", "unsold", "payment_failed" (all written with settledAt).
 */
export async function settleAuction(auctionId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [auction] = await tx
      .select()
      .from(auctionsTable)
      .where(eq(auctionsTable.id, auctionId))
      .for("update")
      .limit(1);

    if (!auction || auction.status !== "ended") return; // already settled or wrong state

    const now = new Date();

    // No bids → unsold
    if (!auction.currentBidderId || auction.bidCount === 0) {
      await tx.update(auctionsTable)
        .set({ status: "unsold", settledAt: now })
        .where(eq(auctionsTable.id, auctionId));
      logger.info({ auctionId }, "auction-settlement: unsold (no bids)");
      return;
    }

    // Reserve not met → unsold
    if (auction.reservePrice && Number(auction.currentBid) < Number(auction.reservePrice)) {
      await tx.update(auctionsTable)
        .set({ status: "unsold", settledAt: now })
        .where(eq(auctionsTable.id, auctionId));
      logger.info({ auctionId, currentBid: auction.currentBid, reservePrice: auction.reservePrice }, "auction-settlement: unsold (reserve not met)");
      return;
    }

    // Settle — charge winner, pay seller
    const winnerId = auction.currentBidderId;
    const currentBid = Number(auction.currentBid);

    const [sellerRow] = await tx
      .select({ accountTier: usersTable.accountTier })
      .from(usersTable)
      .where(eq(usersTable.id, auction.sellerId))
      .limit(1);
    const feeRate = getTxFeeRate(sellerRow?.accountTier);
    const fee = Number((currentBid * feeRate).toFixed(2));
    const sellerAmount = Number((currentBid - fee).toFixed(2));

    // Atomic check-and-deduct from winner
    const [debited] = await tx
      .update(walletsTable)
      .set({
        balance:    sql`${walletsTable.balance} - ${currentBid}`,
        totalSpent: sql`${walletsTable.totalSpent} + ${currentBid}`,
      })
      .where(and(eq(walletsTable.userId, winnerId), gte(walletsTable.balance, String(currentBid))))
      .returning();

    if (!debited) {
      // Winner can't pay — mark payment_failed, no payout
      await tx.update(auctionsTable)
        .set({ status: "payment_failed", settledAt: now })
        .where(eq(auctionsTable.id, auctionId));
      logger.warn({ auctionId, winnerId, currentBid }, "auction-settlement: payment_failed — winner has insufficient funds");
      return;
    }

    // Credit seller (create wallet if absent)
    await tx.insert(walletsTable).values({ userId: auction.sellerId }).onConflictDoNothing();
    await tx
      .update(walletsTable)
      .set({
        balance:     sql`${walletsTable.balance} + ${sellerAmount}`,
        totalEarned: sql`${walletsTable.totalEarned} + ${sellerAmount}`,
      })
      .where(eq(walletsTable.userId, auction.sellerId));

    // Transaction records — both with fee + relatedUserId
    await tx.insert(transactionsTable).values([
      {
        userId:        winnerId,
        type:          "auction_purchase",
        amount:        String(-currentBid),
        fee:           String(fee),
        status:        "completed",
        description:   `Auction won: ${auction.title}`,
        relatedUserId: auction.sellerId,
      },
      {
        userId:        auction.sellerId,
        type:          "auction_sale",
        amount:        String(sellerAmount),
        fee:           String(fee),
        status:        "completed",
        description:   `Auction sold: ${auction.title}`,
        relatedUserId: winnerId,
      },
    ]);

    await tx.update(auctionsTable)
      .set({ status: "sold", settledAt: now })
      .where(eq(auctionsTable.id, auctionId));

    logger.info({ auctionId, winnerId, currentBid, sellerAmount, fee }, "auction-settlement: sold");
  });
}

/**
 * Settlement sweep — select all "ended" auctions and settle each.
 * Wrapped in a Postgres advisory lock so concurrent runs bail immediately.
 * Intended to run every ~2 minutes via setInterval.
 */
export async function runAuctionSettlementSweep(): Promise<void> {
  const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${AUCTION_SETTLEMENT_LOCK_KEY}) AS acquired`);
  const acquired = (lockResult.rows as Array<{ acquired: boolean }>)[0]?.acquired;
  if (!acquired) {
    logger.info("auction-settlement: sweep skipped — another sweep already running");
    return;
  }

  try {
    const ended = await db
      .select({ id: auctionsTable.id })
      .from(auctionsTable)
      .where(eq(auctionsTable.status, "ended"));

    for (const { id } of ended) {
      await settleAuction(id).catch((err) =>
        logger.error({ err, auctionId: id }, "auction-settlement: failed to settle auction"),
      );
    }

    if (ended.length > 0) {
      logger.info({ count: ended.length }, "auction-settlement: sweep complete");
    }
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${AUCTION_SETTLEMENT_LOCK_KEY})`).catch(() => {});
  }
}
