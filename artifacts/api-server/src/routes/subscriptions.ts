import { Router, type IRouter } from "express";
import { db, usersTable, walletsTable, transactionsTable, subscriptionsTable, notificationsTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/adminAuth";
import { getUserSummaries } from "../lib/helpers";
import { getSubFeeRate, SUBSCRIPTION_ELIGIBLE_TIERS } from "../lib/fees";
import { runBillingTick } from "../lib/billing";

const router: IRouter = Router();

const SUB_PRICE_MIN = 2.99;
const SUB_PRICE_MAX = 99.99;

// Set or clear creator subscription price
// Requires creator, pro, or elite tier
router.patch("/users/:userId/subscription-price", requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  const me = (req as any).user;
  if (me.id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Only creator+ tiers may charge subscriptions (admins always bypass)
  if (!me.isAdmin && !SUBSCRIPTION_ELIGIBLE_TIERS.has(me.accountTier)) {
    res.status(403).json({
      error: "Subscription pricing requires Creator tier or above. Verify your identity to upgrade to Creator for free.",
      tierRequired: "creator",
    });
    return;
  }

  const { price } = req.body as { price?: number | null };

  if (price === undefined || price === null) {
    await db.update(usersTable).set({ subscriptionPrice: null }).where(eq(usersTable.id, userId));
    res.json({ ok: true, subscriptionPrice: null });
    return;
  }

  if (typeof price !== "number" || price < SUB_PRICE_MIN || price > SUB_PRICE_MAX) {
    res.status(400).json({ error: `Subscription price must be between $${SUB_PRICE_MIN} and $${SUB_PRICE_MAX}` });
    return;
  }

  const rounded = Number(price.toFixed(2));
  await db.update(usersTable).set({ subscriptionPrice: String(rounded) }).where(eq(usersTable.id, userId));
  res.json({ ok: true, subscriptionPrice: rounded });
});

// Subscribe to a creator
router.post("/users/:creatorId/subscribe", requireAuth, async (req, res) => {
  const creatorId = parseInt(req.params.creatorId as string);
  const subscriberId = (req as any).user.id;

  if (subscriberId === creatorId) {
    res.status(400).json({ error: "Cannot subscribe to yourself" });
    return;
  }

  const [creator] = await db.select({
    id:                usersTable.id,
    subscriptionPrice: usersTable.subscriptionPrice,
    displayName:       usersTable.displayName,
    username:          usersTable.username,
    accountTier:       usersTable.accountTier,
  }).from(usersTable).where(eq(usersTable.id, creatorId)).limit(1);

  if (!creator) { res.status(404).json({ error: "Creator not found" }); return; }
  if (!creator.subscriptionPrice) {
    res.status(400).json({ error: "This creator has not enabled subscriptions" });
    return;
  }

  // Creator must have subscription-eligible tier
  if (!SUBSCRIPTION_ELIGIBLE_TIERS.has(creator.accountTier ?? "free")) {
    res.status(400).json({ error: "This creator does not have an eligible plan for subscriptions" });
    return;
  }

  const price     = Number(creator.subscriptionPrice);
  const feeRate   = getSubFeeRate(creator.accountTier);
  const fee       = Number((price * feeRate).toFixed(2));
  const netAmount = Number((price - fee).toFixed(2));

  const [existing] = await db
    .select({ id: subscriptionsTable.id, status: subscriptionsTable.status })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.subscriberId, subscriberId), eq(subscriptionsTable.creatorId, creatorId)))
    .limit(1);

  if (existing?.status === "active") {
    res.status(409).json({ error: "Already subscribed" });
    return;
  }

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  try {
    const sub = await db.transaction(async (tx) => {
      const [senderWallet] = await tx
        .update(walletsTable)
        .set({
          balance:    sql`${walletsTable.balance} - ${price}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${price}`,
        })
        .where(and(eq(walletsTable.userId, subscriberId), gte(walletsTable.balance, String(price))))
        .returning();

      if (!senderWallet) {
        const err = new Error("Insufficient balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      await tx.insert(walletsTable).values({ userId: creatorId }).onConflictDoNothing();
      await tx
        .update(walletsTable)
        .set({
          balance:     sql`${walletsTable.balance} + ${netAmount}`,
          totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}`,
        })
        .where(eq(walletsTable.userId, creatorId));

      await tx.insert(transactionsTable).values({
        userId:        subscriberId,
        type:          "subscription",
        amount:        String(price),
        fee:           String(fee),
        status:        "completed",
        description:   `Subscription to ${creator.displayName ?? creator.username}`,
        relatedUserId: creatorId,
      });

      let newSub: typeof subscriptionsTable.$inferSelect;
      if (existing) {
        [newSub] = await tx
          .update(subscriptionsTable)
          .set({ status: "active", price: String(price), currentPeriodStart: new Date(), currentPeriodEnd: periodEnd, cancelledAt: null })
          .where(eq(subscriptionsTable.id, existing.id))
          .returning();
      } else {
        [newSub] = await tx
          .insert(subscriptionsTable)
          .values({ subscriberId, creatorId, price: String(price), currentPeriodEnd: periodEnd })
          .returning();
      }

      return newSub;
    });

    // Fire-and-forget notification to creator
    const summaries = await getUserSummaries([subscriberId]);
    const actor = summaries[subscriberId];
    db.insert(notificationsTable).values({
      userId:   creatorId,
      type:     "subscription",
      message:  `${actor?.displayName ?? "Someone"} subscribed to you`,
      actorId:  subscriberId,
    }).catch(() => {});

    res.status(201).json({ ...sub, price: Number(sub.price) });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }
    throw e;
  }
});

// Cancel subscription (stays active until period end)
router.delete("/users/:creatorId/subscribe", requireAuth, async (req, res) => {
  const creatorId   = parseInt(req.params.creatorId as string);
  const subscriberId = (req as any).user.id;

  const [sub] = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.subscriberId, subscriberId),
      eq(subscriptionsTable.creatorId, creatorId),
      eq(subscriptionsTable.status, "active"),
    ))
    .limit(1);

  if (!sub) { res.status(404).json({ error: "No active subscription found" }); return; }

  await db
    .update(subscriptionsTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(subscriptionsTable.id, sub.id));

  res.json({ ok: true });
});

// My subscriptions — both active and still-in-period cancelled ones
router.get("/subscriptions", requireAuth, async (req, res) => {
  const subscriberId = (req as any).user.id;
  const limit  = Math.min(parseInt(req.query.limit  as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const now = new Date();
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.subscriberId, subscriberId),
      // active OR cancelled-but-not-yet-expired
      sql`(${subscriptionsTable.status} = 'active' OR (${subscriptionsTable.status} = 'cancelled' AND ${subscriptionsTable.currentPeriodEnd} > ${now}))`,
    ))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const creatorIds = subs.map(s => s.creatorId);
  const summaries  = creatorIds.length > 0 ? await getUserSummaries(creatorIds, subscriberId) : {};

  res.json(subs.map(s => ({ ...s, price: Number(s.price), creator: summaries[s.creatorId] ?? null })));
});

// Creator's active subscriber list
router.get("/users/:userId/subscribers", requireAuth, async (req, res) => {
  const creatorId = parseInt(req.params.userId as string);
  const me = (req as any).user;
  if (me.id !== creatorId && !me.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit  = Math.min(parseInt(req.query.limit  as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.creatorId, creatorId), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const subscriberIds = subs.map(s => s.subscriberId);
  const summaries     = subscriberIds.length > 0 ? await getUserSummaries(subscriberIds) : {};

  res.json(subs.map(s => ({ ...s, price: Number(s.price), subscriber: summaries[s.subscriberId] ?? null })));
});

// Admin billing tick — also callable manually for debugging
router.post("/subscriptions/billing-tick", requireAdmin, async (req, res) => {
  const result = await runBillingTick();
  res.json(result);
});

export default router;
