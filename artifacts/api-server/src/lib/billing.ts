import { db, usersTable, walletsTable, transactionsTable, subscriptionsTable, notificationsTable } from "@workspace/db";
import { eq, and, lt, sql, gte } from "drizzle-orm";
import { getSubFeeRate } from "./fees";
import { logger } from "./logger";

export interface BillingTickResult {
  processedActive: number;
  renewed: number;
  failedRenewal: number;
  expiredCancelled: number;
}

// Fixed advisory lock key — any two-argument int pair or single bigint works;
// this constant identifies the billing tick exclusively.
const BILLING_ADVISORY_LOCK_KEY = sql`438571209348573::bigint`;

/**
 * Core billing tick — should be called on server startup and on a regular schedule (e.g. hourly).
 *
 * What it does:
 *  1. Acquires a Postgres session-level advisory lock so concurrent ticks bail immediately.
 *  2. Transitions cancelled subscriptions whose period has ended → expired (no charge attempt).
 *  3. Attempts to renew active subscriptions whose period has ended.
 *     - Uses the LOCKED price from when the subscriber signed up (not the creator's current price).
 *     - Inside the renewal transaction: re-selects the sub row FOR UPDATE and re-checks it is
 *       still active and past-due before charging, so concurrent ticks can't double-bill.
 *     - On success: advances currentPeriodEnd by one month inside the SAME transaction.
 *     - On failure (insufficient balance or disabled subs): marks expired, notifies the subscriber.
 */
export async function runBillingTick(): Promise<BillingTickResult> {
  // ── 0. Belt-and-suspenders: advisory lock ────────────────────────────────
  // pg_try_advisory_lock returns false immediately if another session holds it.
  const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${BILLING_ADVISORY_LOCK_KEY}) AS acquired`);
  const acquired = (lockResult.rows as Array<{ acquired: boolean }>)[0]?.acquired;
  if (!acquired) {
    logger.info("billing: tick skipped — another tick already running (advisory lock held)");
    return { processedActive: 0, renewed: 0, failedRenewal: 0, expiredCancelled: 0 };
  }

  try {
    return await _runTick();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${BILLING_ADVISORY_LOCK_KEY})`).catch(() => {});
  }
}

async function _runTick(): Promise<BillingTickResult> {
  const now = new Date();

  // ── 1. Expire cancelled subs whose period has ended ──────────────────────
  const cancelledExpiry = await db
    .update(subscriptionsTable)
    .set({ status: "expired" })
    .where(and(eq(subscriptionsTable.status, "cancelled"), lt(subscriptionsTable.currentPeriodEnd, now)))
    .returning({ id: subscriptionsTable.id });

  const expiredCancelled = cancelledExpiry.length;
  if (expiredCancelled > 0) {
    logger.info({ count: expiredCancelled }, "billing: expired cancelled subscriptions");
  }

  // ── 2. Collect active subs past their period end ─────────────────────────
  const due = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.status, "active"), lt(subscriptionsTable.currentPeriodEnd, now)));

  let renewed = 0;
  let failedRenewal = 0;

  for (const sub of due) {
    const [creator] = await db
      .select({
        subscriptionPrice: usersTable.subscriptionPrice,
        displayName:       usersTable.displayName,
        username:          usersTable.username,
        accountTier:       usersTable.accountTier,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sub.creatorId))
      .limit(1);

    // Creator no longer has subscriptions enabled → expire immediately
    if (!creator?.subscriptionPrice) {
      await db.update(subscriptionsTable)
        .set({ status: "expired", cancelledAt: now })
        .where(eq(subscriptionsTable.id, sub.id));

      await db.insert(notificationsTable).values({
        userId:  sub.subscriberId,
        type:    "subscription",
        message: "Your subscription has ended — the creator has disabled subscriptions",
        actorId: sub.creatorId,
      }).catch(() => {});

      failedRenewal++;
      continue;
    }

    try {
      let chargeOutcome: string = "insufficient";

      await db.transaction(async (tx) => {
        // Re-select the sub row with a row-level lock so a concurrent tick
        // blocks here and sees the already-advanced period once we commit.
        const [locked] = await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.id, sub.id))
          .for("update")
          .limit(1);

        // If another tick already renewed this sub (period advanced) or it was
        // cancelled/expired in the meantime, skip — no charge.
        if (!locked || locked.status !== "active" || locked.currentPeriodEnd >= now) {
          chargeOutcome = "already_advanced";
          return;
        }

        // Use the LOCKED price from the re-read row
        const price     = Number(locked.price);
        const feeRate   = getSubFeeRate(creator.accountTier);
        const fee       = Number((price * feeRate).toFixed(2));
        const netAmount = Number((price - fee).toFixed(2));

        const newPeriodEnd = new Date(locked.currentPeriodEnd);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        // Atomic debit — WHERE balance >= price prevents double-spend
        const [debited] = await tx
          .update(walletsTable)
          .set({
            balance:    sql`${walletsTable.balance} - ${price}`,
            totalSpent: sql`${walletsTable.totalSpent} + ${price}`,
          })
          .where(and(eq(walletsTable.userId, locked.subscriberId), gte(walletsTable.balance, String(price))))
          .returning();

        if (!debited) {
          const err = new Error("Insufficient balance") as any;
          err.code = "INSUFFICIENT_BALANCE";
          throw err;
        }

        // Ensure creator wallet exists, then credit
        await tx.insert(walletsTable).values({ userId: locked.creatorId }).onConflictDoNothing();
        await tx
          .update(walletsTable)
          .set({
            balance:     sql`${walletsTable.balance} + ${netAmount}`,
            totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}`,
          })
          .where(eq(walletsTable.userId, locked.creatorId));

        // Record transaction
        await tx.insert(transactionsTable).values({
          userId:        locked.subscriberId,
          type:          "subscription",
          amount:        String(price),
          fee:           String(fee),
          status:        "completed",
          description:   `Subscription renewal to ${creator.displayName ?? creator.username}`,
          relatedUserId: locked.creatorId,
        });

        // Advance period — inside the same transaction so no tick can see
        // the old currentPeriodEnd after this commit.
        await tx
          .update(subscriptionsTable)
          .set({ currentPeriodStart: now, currentPeriodEnd: newPeriodEnd })
          .where(eq(subscriptionsTable.id, locked.id));

        chargeOutcome = "renewed";
      });

      if (chargeOutcome === "renewed") {
        renewed++;
      }
      // "already_advanced" → another tick beat us here; not an error, not counted
    } catch {
      // Expire and notify subscriber
      await db.update(subscriptionsTable)
        .set({ status: "expired", cancelledAt: now })
        .where(eq(subscriptionsTable.id, sub.id));

      await db.insert(notificationsTable).values({
        userId:  sub.subscriberId,
        type:    "subscription",
        message: `Your subscription renewal failed — please top up your wallet to resubscribe`,
        actorId: sub.creatorId,
      }).catch(() => {});

      failedRenewal++;
    }
  }

  const result: BillingTickResult = {
    processedActive: due.length,
    renewed,
    failedRenewal,
    expiredCancelled,
  };

  logger.info(result, "billing: tick complete");
  return result;
}
