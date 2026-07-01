import { Router, type IRouter } from "express";
import { db, listingsTable, ordersTable, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { getTxFeeRate } from "../lib/fees";
import { z } from "zod";

const router: IRouter = Router();

const CreateListingBody = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  type: z.enum(["digital", "service", "physical"]).default("digital"),
});

const UpdateListingBody = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  status: z.enum(["active", "sold_out", "archived"]).optional(),
});

async function enrichListings(listings: any[], viewerId?: number) {
  if (listings.length === 0) return [];
  const sellerIds = [...new Set(listings.map(l => l.sellerId))];
  const summaries = await getUserSummaries(sellerIds, viewerId);

  return listings.map(l => ({
    ...l,
    price: Number(l.price),
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    seller: summaries[l.sellerId] ?? null,
  }));
}

router.get("/listings", optionalAuth, async (req, res) => {
  const viewerId = (req as any).userId;
  const { category, type, minPrice, maxPrice, sellerId, limit = 20, offset = 0 } = req.query as any;

  let query = db.select().from(listingsTable).$dynamic();
  const conditions = [
    eq(listingsTable.status, "active"),
    sql`${listingsTable.type} != 'physical'`,
  ];

  if (category) conditions.push(eq(listingsTable.category, category as string));
  if (type && type !== "physical") conditions.push(eq(listingsTable.type, type as string));
  if (sellerId) conditions.push(eq(listingsTable.sellerId, Number(sellerId)));
  if (minPrice) conditions.push(gte(listingsTable.price, String(minPrice)));
  if (maxPrice) conditions.push(lte(listingsTable.price, String(maxPrice)));

  const listings = await query
    .where(and(...conditions))
    .orderBy(desc(listingsTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(listingsTable).where(eq(listingsTable.status, "active"));

  res.json({ listings: await enrichListings(listings, viewerId), total: Number(countResult[0].count) });
});

router.post("/listings", requireAuth, async (req, res) => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.type === "physical") {
    res.status(400).json({
      error: "Physical goods must be sold through the SWEATHEORY merch shop, not the marketplace.",
      redirect: "/merch/create",
    });
    return;
  }

  const sellerId = (req as any).user.id;
  const [listing] = await db.insert(listingsTable).values({
    ...parsed.data,
    sellerId,
    price: String(parsed.data.price),
  }).returning();

  const [enriched] = await enrichListings([listing], sellerId);
  res.status(201).json(enriched);
});

router.get("/listings/:listingId", optionalAuth, async (req, res) => {
  const listingId = parseInt(req.params.listingId as string);
  if (isNaN(listingId)) { res.status(400).json({ error: "Invalid listingId" }); return; }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId)).limit(1);
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }

  const viewerId = (req as any).userId;
  const [enriched] = await enrichListings([listing], viewerId);
  res.json(enriched);
});

router.patch("/listings/:listingId", requireAuth, async (req, res) => {
  const listingId = parseInt(req.params.listingId as string);
  const userId = (req as any).user.id;

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId)).limit(1);
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }
  if (listing.sellerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateListingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (updateData.price != null) updateData.price = String(updateData.price);

  const [updated] = await db.update(listingsTable).set(updateData).where(eq(listingsTable.id, listingId)).returning();
  const [enriched] = await enrichListings([updated], userId);
  res.json(enriched);
});

router.post("/listings/:listingId/purchase", requireAuth, async (req, res) => {
  const listingId = parseInt(req.params.listingId as string);
  const buyerId = (req as any).user.id;

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, listingId)).limit(1);
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  if (listing.type === "physical") {
    res.status(400).json({
      error: "Physical goods must be sold through the SWEATHEORY merch shop, not the marketplace.",
      redirect: "/merch/create",
    });
    return;
  }
  if (listing.status !== "active") { res.status(400).json({ error: "Listing is not available" }); return; }
  if (listing.sellerId === buyerId) { res.status(400).json({ error: "Cannot purchase your own listing" }); return; }

  const price = Number(listing.price);
  // Fee rate based on seller's tier — higher tier = lower platform cut
  const [seller] = await db.select({ accountTier: usersTable.accountTier })
    .from(usersTable).where(eq(usersTable.id, listing.sellerId)).limit(1);
  const feeRate = getTxFeeRate(seller?.accountTier);
  const fee = Number((price * feeRate).toFixed(2));
  const sellerAmount = Number((price - fee).toFixed(2));

  let order: typeof ordersTable.$inferSelect;
  try {
    order = await db.transaction(async (tx) => {
      // Atomic check-and-deduct from buyer
      const [buyerWallet] = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${price}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${price}`,
        })
        .where(and(eq(walletsTable.userId, buyerId), gte(walletsTable.balance, String(price))))
        .returning();

      if (!buyerWallet) {
        const err = new Error("Insufficient wallet balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      // Credit seller wallet (create if absent)
      const [sellerWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, listing.sellerId)).limit(1);
      if (!sellerWallet) {
        await tx.insert(walletsTable).values({ userId: listing.sellerId });
      }
      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${sellerAmount}`,
          totalEarned: sql`${walletsTable.totalEarned} + ${sellerAmount}`,
        })
        .where(eq(walletsTable.userId, listing.sellerId));

      await tx.insert(transactionsTable).values({
        userId: buyerId,
        type: "purchase",
        amount: String(price),
        fee: String(fee),
        status: "completed",
        description: `Purchased: ${listing.title}`,
        relatedUserId: listing.sellerId,
      });

      await tx.update(listingsTable)
        .set({ salesCount: sql`${listingsTable.salesCount} + 1` })
        .where(eq(listingsTable.id, listingId));

      const [o] = await tx.insert(ordersTable).values({
        buyerId,
        listingId,
        sellerId: listing.sellerId,
        price: String(price),
        status: "completed",
      }).returning();

      return o;
    });
  } catch (e: any) {
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }
    // Unique constraint violation: concurrent request already completed the purchase
    // The debit was rolled back by the transaction — buyer is NOT charged twice
    if (e.code === "23505") {
      res.status(409).json({ error: "Already purchased" }); return;
    }
    throw e;
  }

  const [listingEnriched] = await enrichListings([listing], buyerId);

  res.json({
    ...order,
    price: Number(order.price),
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    listing: listingEnriched,
  });
});

router.get("/orders", requireAuth, async (req, res) => {
  const buyerId = (req as any).user.id;
  const { limit = 20, offset = 0 } = req.query as any;

  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.buyerId, buyerId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  const listingIds = [...new Set(orders.map(o => o.listingId))];
  let listingMap: Record<number, any> = {};
  if (listingIds.length > 0) {
    const listings = await db.select().from(listingsTable)
      .where(sql`${listingsTable.id} = ANY(${listingIds})`);
    const enriched = await enrichListings(listings, buyerId);
    for (const l of enriched) listingMap[l.id] = l;
  }

  res.json(orders.map(o => ({
    ...o,
    price: Number(o.price),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    listing: listingMap[o.listingId] ?? null,
  })));
});

export default router;
