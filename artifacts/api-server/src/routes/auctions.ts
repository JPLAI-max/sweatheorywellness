import { Router, type IRouter } from "express";
import { scanAsset } from "../lib/csam";
import { db, auctionsTable, auctionBidsTable, auctionWatchesTable, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, and, lt, lte, gte, sql, ilike, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { getTxFeeRate } from "../lib/fees";
import { settleAuction } from "../lib/auctionSettlement";
import { z } from "zod";
import { isValidR2MediaUrl, serveMediaUrl } from "../lib/r2";
import { createLimiter, bidLimiter, walletLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();

const CreateAuctionBody = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  condition: z.enum(["new", "like_new", "used", "collectible"]).default("new"),
  itemType: z.enum(["physical", "digital", "experience", "collectible", "commission", "ticket"]).default("physical"),
  startingBid: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  buyNowPrice: z.number().positive().optional(),
  shippingInfo: z.string().optional(),
  endTime: z.string().datetime(),
});

const UpdateAuctionBody = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  buyNowPrice: z.number().positive().optional().nullable(),
  shippingInfo: z.string().optional(),
});

const PlaceBidBody = z.object({
  amount: z.number().positive(),
});

async function enrichAuctions(auctions: any[], viewerId?: number) {
  if (auctions.length === 0) return [];

  const sellerIds = [...new Set(auctions.map((a) => a.sellerId))];
  const bidderIds = auctions.map((a) => a.currentBidderId).filter(Boolean) as number[];
  const allUserIds = [...new Set([...sellerIds, ...bidderIds])];
  const summaries = await getUserSummaries(allUserIds, viewerId);

  let watchedIds = new Set<number>();
  if (viewerId) {
    const watches = await db
      .select({ auctionId: auctionWatchesTable.auctionId })
      .from(auctionWatchesTable)
      .where(and(
        eq(auctionWatchesTable.userId, viewerId),
        inArray(auctionWatchesTable.auctionId, auctions.map((a) => a.id)),
      ));
    watchedIds = new Set(watches.map((w) => w.auctionId));
  }

  return auctions.map((a) => ({
    ...a,
    startingBid: Number(a.startingBid),
    reservePrice: a.reservePrice != null ? Number(a.reservePrice) : null,
    buyNowPrice: a.buyNowPrice != null ? Number(a.buyNowPrice) : null,
    currentBid: a.currentBid != null ? Number(a.currentBid) : null,
    endTime: a.endTime instanceof Date ? a.endTime.toISOString() : a.endTime,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    tags: a.tags ?? [],
    seller: summaries[a.sellerId] ?? null,
    currentBidder: a.currentBidderId ? (summaries[a.currentBidderId] ?? null) : null,
    isWatching: watchedIds.has(a.id),
  }));
}

// Auto-end expired auctions (called on list/get)
async function autoEndExpired() {
  const now = new Date();
  await db
    .update(auctionsTable)
    .set({ status: "ended" })
    .where(and(eq(auctionsTable.status, "active"), lt(auctionsTable.endTime, now)));
}

// GET /auctions
router.get("/auctions", optionalAuth, async (req, res) => {
  await autoEndExpired();

  const viewerId = (req as any).userId;
  const {
    category,
    itemType,
    status = "active",
    q,
    sort = "ending_soon",
    limit = "24",
    offset = "0",
    sellerId,
  } = req.query as Record<string, string>;

  let query = db.select().from(auctionsTable).$dynamic();

  const conditions: any[] = [eq(auctionsTable.scanStatus, 'clean')];
  if (status) conditions.push(eq(auctionsTable.status, status));
  if (category) conditions.push(eq(auctionsTable.category, category));
  if (itemType) conditions.push(eq(auctionsTable.itemType, itemType));
  if (sellerId) conditions.push(eq(auctionsTable.sellerId, Number(sellerId)));
  if (q) conditions.push(ilike(auctionsTable.title, `%${q}%`));

  if (conditions.length > 0) query = query.where(and(...conditions)) as any;

  if (sort === "ending_soon") query = query.orderBy(auctionsTable.endTime) as any;
  else if (sort === "highest_bid") query = query.orderBy(desc(auctionsTable.currentBid)) as any;
  else if (sort === "newest") query = query.orderBy(desc(auctionsTable.createdAt)) as any;
  else if (sort === "buy_now") query = query.orderBy(desc(auctionsTable.buyNowPrice)) as any;
  else query = query.orderBy(auctionsTable.endTime) as any;

  const auctions = await query.limit(Number(limit)).offset(Number(offset));
  res.json(await enrichAuctions(auctions, viewerId));
});

// GET /auctions/:auctionId
router.get("/auctions/:auctionId", optionalAuth, async (req, res) => {
  await autoEndExpired();
  const id = Number(req.params["auctionId"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [auction] = await db.select().from(auctionsTable)
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.scanStatus, 'clean')));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }

  const [enriched] = await enrichAuctions([auction], (req as any).userId);
  res.json(enriched);
});

// POST /auctions
router.post("/auctions", requireAuth, createLimiter, async (req, res) => {
  const parsed = CreateAuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.imageUrl && !isValidR2MediaUrl(parsed.data.imageUrl)) { res.status(400).json({ error: "imageUrl must point to a valid R2 media object" }); return; }
  if (parsed.data.videoUrl && !isValidR2MediaUrl(parsed.data.videoUrl)) { res.status(400).json({ error: "videoUrl must point to a valid R2 media object" }); return; }

  const sellerId = (req as any).user.id;
  const { startingBid, reservePrice, buyNowPrice, endTime, ...rest } = parsed.data;
  const auctionHasMedia = !!(rest.imageUrl || rest.videoUrl);

  const [auction] = await db
    .insert(auctionsTable)
    .values({
      ...rest,
      sellerId,
      startingBid: String(startingBid),
      reservePrice: reservePrice != null ? String(reservePrice) : undefined,
      buyNowPrice: buyNowPrice != null ? String(buyNowPrice) : undefined,
      endTime: new Date(endTime),
      scanStatus: auctionHasMedia ? 'pending' : 'clean',
    })
    .returning();

  if (auctionHasMedia) {
    void scanAsset(auction.id, 'auction');
  }

  // Return raw enriched data (creation response bypasses scan filter)
  const summaries = await getUserSummaries([sellerId]);
  res.status(201).json({
    ...auction,
    startingBid: Number(auction.startingBid),
    reservePrice: auction.reservePrice != null ? Number(auction.reservePrice) : null,
    buyNowPrice: auction.buyNowPrice != null ? Number(auction.buyNowPrice) : null,
    currentBid: null,
    endTime: auction.endTime instanceof Date ? auction.endTime.toISOString() : auction.endTime,
    createdAt: auction.createdAt instanceof Date ? auction.createdAt.toISOString() : auction.createdAt,
    tags: auction.tags ?? [],
    seller: summaries[sellerId] ?? null,
    currentBidder: null,
    isWatching: false,
  });
});

// PATCH /auctions/:auctionId
router.patch("/auctions/:auctionId", requireAuth, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!auction) { res.status(404).json({ error: "Not found" }); return; }
  if (auction.sellerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (auction.status !== "active") { res.status(400).json({ error: "Cannot update ended auction" }); return; }

  const parsed = UpdateAuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.imageUrl && !isValidR2MediaUrl(parsed.data.imageUrl)) { res.status(400).json({ error: "imageUrl must point to a valid R2 media object" }); return; }

  const { buyNowPrice, ...rest } = parsed.data;
  const updateData: any = { ...rest };
  if (buyNowPrice !== undefined) updateData.buyNowPrice = buyNowPrice != null ? String(buyNowPrice) : null;

  // Re-quarantine if any media field is being changed
  const touchesAuctionMedia = 'imageUrl' in rest || 'videoUrl' in rest;
  if (touchesAuctionMedia) {
    const resultImageUrl = 'imageUrl' in rest ? rest.imageUrl : auction.imageUrl;
    const resultVideoUrl = 'videoUrl' in rest ? rest.videoUrl : auction.videoUrl;
    const resultHasMedia = !!(resultImageUrl || resultVideoUrl);
    updateData.scanStatus = resultHasMedia ? 'pending' : 'clean';
  }

  const [updated] = await db.update(auctionsTable).set(updateData).where(eq(auctionsTable.id, id)).returning();

  if (touchesAuctionMedia && updated.scanStatus === 'pending') {
    void scanAsset(updated.id, 'auction');
  }

  const [enriched] = await enrichAuctions([updated], userId);
  res.json(enriched);
});

// DELETE /auctions/:auctionId
router.delete("/auctions/:auctionId", requireAuth, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!auction) { res.status(404).json({ error: "Not found" }); return; }
  if (auction.sellerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (auction.bidCount > 0) { res.status(400).json({ error: "Cannot delete an auction that has bids" }); return; }

  await db.update(auctionsTable).set({ status: "cancelled" }).where(eq(auctionsTable.id, id));
  res.json({ ok: true });
});

// GET /auctions/:auctionId/bids
router.get("/auctions/:auctionId/bids", optionalAuth, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const limit = Number((req.query as any).limit ?? 20);

  const bids = await db
    .select()
    .from(auctionBidsTable)
    .where(eq(auctionBidsTable.auctionId, id))
    .orderBy(desc(auctionBidsTable.createdAt))
    .limit(limit);

  if (bids.length === 0) { res.json([]); return; }

  const bidderIds = [...new Set(bids.map((b) => b.bidderId))];
  const summaries = await getUserSummaries(bidderIds);

  res.json(
    bids.map((b) => ({
      ...b,
      amount: Number(b.amount),
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
      bidder: summaries[b.bidderId] ?? null,
    })),
  );
});

// POST /auctions/:auctionId/bids
router.post("/auctions/:auctionId/bids", requireAuth, bidLimiter, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  const parsed = PlaceBidBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Validate auction state before entering transaction
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (auction.status !== "active") { res.status(400).json({ error: "Auction is not active" }); return; }
  if (new Date() >= auction.endTime) { res.status(400).json({ error: "Auction has ended" }); return; }
  if (auction.sellerId === userId) { res.status(400).json({ error: "Cannot bid on your own auction" }); return; }

  const { amount } = parsed.data;
  const currentBid = auction.currentBid != null ? Number(auction.currentBid) : null;
  const startingBid = Number(auction.startingBid);
  const minBid = currentBid != null ? currentBid + Math.max(1, currentBid * 0.05) : startingBid;

  if (amount < minBid - 0.001) {
    res.status(400).json({ error: `Minimum bid is $${minBid.toFixed(2)}` });
    return;
  }

  // All bid writes in a transaction with a row-lock so concurrent bids
  // see the latest currentBid and can't both pass the same stale min-increment.
  let updated: typeof auctionsTable.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(auctionsTable)
        .where(eq(auctionsTable.id, id))
        .for("update")
        .limit(1);

      if (!locked || locked.status !== "active") {
        const err = new Error("Auction is not active") as any;
        err.code = "AUCTION_NOT_ACTIVE";
        throw err;
      }
      if (new Date() >= locked.endTime) {
        const err = new Error("Auction has ended") as any;
        err.code = "AUCTION_ENDED";
        throw err;
      }

      // Re-check minimum increment against the LOCKED currentBid
      const lockedCurrentBid = locked.currentBid != null ? Number(locked.currentBid) : null;
      const lockedStartingBid = Number(locked.startingBid);
      const lockedMinBid = lockedCurrentBid != null
        ? lockedCurrentBid + Math.max(1, lockedCurrentBid * 0.05)
        : lockedStartingBid;

      if (amount < lockedMinBid - 0.001) {
        const err = new Error(`Minimum bid is $${lockedMinBid.toFixed(2)}`) as any;
        err.code = "BID_TOO_LOW";
        err.minBid = lockedMinBid;
        throw err;
      }

      // Anti-snipe: extend by 2 minutes if bidding in the final 2 minutes
      const now = new Date();
      const twoMins = 2 * 60 * 1000;
      const newEndTime = locked.endTime.getTime() - now.getTime() < twoMins
        ? new Date(now.getTime() + twoMins)
        : locked.endTime;

      await tx.update(auctionBidsTable)
        .set({ isWinning: false })
        .where(eq(auctionBidsTable.auctionId, id));

      await tx.insert(auctionBidsTable).values({
        auctionId: id,
        bidderId: userId,
        amount: String(amount),
        isWinning: true,
      });

      const [u] = await tx
        .update(auctionsTable)
        .set({
          currentBid:       String(amount),
          currentBidderId:  userId,
          bidCount:         sql`${auctionsTable.bidCount} + 1`,
          endTime:          newEndTime,
        })
        .where(eq(auctionsTable.id, id))
        .returning();

      return u!;
    });
  } catch (e: any) {
    if (e.code === "AUCTION_NOT_ACTIVE") { res.status(400).json({ error: "Auction is not active" }); return; }
    if (e.code === "AUCTION_ENDED")      { res.status(400).json({ error: "Auction has ended" }); return; }
    if (e.code === "BID_TOO_LOW")        { res.status(400).json({ error: e.message, minBid: e.minBid }); return; }
    throw e;
  }

  const [enriched] = await enrichAuctions([updated], userId);
  res.json(enriched);
});

// POST /auctions/:auctionId/buy-now
router.post("/auctions/:auctionId/buy-now", requireAuth, walletLimiter, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  // Preliminary checks outside the transaction (re-verified inside)
  const [auctionPre] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!auctionPre) { res.status(404).json({ error: "Auction not found" }); return; }
  if (auctionPre.status !== "active") { res.status(400).json({ error: "Auction is not active" }); return; }
  if (!auctionPre.buyNowPrice) { res.status(400).json({ error: "No buy-now price set" }); return; }
  if (auctionPre.sellerId === userId) { res.status(400).json({ error: "Cannot purchase your own auction" }); return; }

  let updated: typeof auctionsTable.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      // Lock the auction row to prevent concurrent buy-now races
      const [auction] = await tx.select().from(auctionsTable).where(eq(auctionsTable.id, id)).for("update");
      if (!auction || auction.status !== "active" || !auction.buyNowPrice) {
        const err = new Error("Auction no longer available") as any;
        err.code = "AUCTION_UNAVAILABLE";
        throw err;
      }

      const price = Number(auction.buyNowPrice);
      const [sellerRow] = await tx.select({ accountTier: usersTable.accountTier })
        .from(usersTable).where(eq(usersTable.id, auction.sellerId)).limit(1);
      const feeRate = getTxFeeRate(sellerRow?.accountTier);
      const fee = Number((price * feeRate).toFixed(2));
      const sellerAmount = Number((price - fee).toFixed(2));

      // Atomic check-and-deduct from buyer
      const [buyerWallet] = await tx.update(walletsTable)
        .set({
          balance:    sql`${walletsTable.balance} - ${String(price)}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${String(price)}`,
        })
        .where(and(eq(walletsTable.userId, userId), gte(walletsTable.balance, String(price))))
        .returning();

      if (!buyerWallet) {
        const err = new Error("Insufficient wallet balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      // Credit seller wallet (create if absent)
      await tx.insert(walletsTable).values({ userId: auction.sellerId }).onConflictDoNothing();
      await tx.update(walletsTable)
        .set({
          balance:     sql`${walletsTable.balance} + ${String(sellerAmount)}`,
          totalEarned: sql`${walletsTable.totalEarned} + ${String(sellerAmount)}`,
        })
        .where(eq(walletsTable.userId, auction.sellerId));

      await tx.insert(transactionsTable).values([
        {
          userId,
          type:          "auction_purchase",
          amount:        String(-price),
          fee:           String(fee),
          status:        "completed",
          description:   `Buy Now: ${auction.title}`,
          relatedUserId: auction.sellerId,
        },
        {
          userId:        auction.sellerId,
          type:          "auction_sale",
          amount:        String(sellerAmount),
          fee:           String(fee),
          status:        "completed",
          description:   `Sale (Buy Now): ${auction.title}`,
          relatedUserId: userId,
        },
      ]);

      const [u] = await tx
        .update(auctionsTable)
        .set({ status: "sold", currentBidderId: userId, currentBid: String(price) })
        .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
        .returning();

      if (!u) {
        // Another concurrent transaction already sold this auction
        const err = new Error("Auction no longer available") as any;
        err.code = "AUCTION_UNAVAILABLE";
        throw err;
      }

      return u;
    });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }
    if (e.code === "AUCTION_UNAVAILABLE") {
      res.status(409).json({ error: "Auction no longer available" });
      return;
    }
    throw e;
  }

  const [enriched] = await enrichAuctions([updated], userId);
  res.json(enriched);
});

// POST /auctions/:auctionId/watch
router.post("/auctions/:auctionId/watch", requireAuth, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  const [existing] = await db
    .select()
    .from(auctionWatchesTable)
    .where(and(eq(auctionWatchesTable.auctionId, id), eq(auctionWatchesTable.userId, userId)));

  if (existing) {
    await db.delete(auctionWatchesTable).where(eq(auctionWatchesTable.id, existing.id));
    await db.update(auctionsTable).set({ watchCount: sql`${auctionsTable.watchCount} - 1` }).where(eq(auctionsTable.id, id));
    res.json({ watching: false });
  } else {
    await db.insert(auctionWatchesTable).values({ auctionId: id, userId });
    await db.update(auctionsTable).set({ watchCount: sql`${auctionsTable.watchCount} + 1` }).where(eq(auctionsTable.id, id));
    res.json({ watching: true });
  }
});

// POST /auctions/:auctionId/end
router.post("/auctions/:auctionId/end", requireAuth, async (req, res) => {
  const id = Number(req.params["auctionId"] as string);
  const userId = (req as any).user.id;

  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!auction) { res.status(404).json({ error: "Not found" }); return; }
  if (auction.sellerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (auction.status !== "active") { res.status(400).json({ error: "Already ended" }); return; }

  const newStatus = auction.bidCount > 0 ? "ended" : "cancelled";
  const [updated] = await db.update(auctionsTable).set({ status: newStatus }).where(eq(auctionsTable.id, id)).returning();

  // Settle immediately on manual end if there are bids
  if (newStatus === "ended") {
    settleAuction(id).catch((err) =>
      req.log.error({ err, auctionId: id }, "auction-settlement: inline settle failed after manual end"),
    );
  }

  const [enriched] = await enrichAuctions([updated], userId);
  res.json(enriched);
});

export default router;
