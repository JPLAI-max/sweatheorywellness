import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { db, merchProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserSummaries } from "../lib/helpers";
import { CCBILL_RATE, CCBILL_FLAT, MERCH_CREATOR_SHARE, MERCH_FLOOR_MULT } from "../lib/fees";
import { scanAsset } from "../lib/csam";
import {
  getOrCreateShop,
  listShops,
  getCatalogBlueprints,
  getBlueprint,
  getBlueprintPrintProviders,
  getVariants,
  getOrder,
  blueprintTitleToProductType,
  resolveVariantNames,
} from "../lib/printify";

const router: IRouter = Router();

// GET /printify/shop — get (or create) the Sweatheory Printify shop
router.get("/printify/shop", requireAuth, async (req, res) => {
  const shopId = await getOrCreateShop();
  const shops = await listShops();
  const shop = shops.find((s: any) => String(s.id) === shopId) ?? { id: shopId };
  res.json(shop);
});

// GET /printify/catalog — browse all blueprints
// Blueprints don't change often so the API caches them process-wide.
let _blueprintsCache: any[] | null = null;
let _blueprintsCachedAt = 0;
const BLUEPRINT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

router.get("/printify/catalog", async (req, res) => {
  try {
    const now = Date.now();
    if (!_blueprintsCache || now - _blueprintsCachedAt > BLUEPRINT_CACHE_TTL_MS) {
      _blueprintsCache = await getCatalogBlueprints();
      _blueprintsCachedAt = now;
    }
    res.json(_blueprintsCache);
  } catch (err: any) {
    req.log.error({ err }, "printify: catalog fetch failed");
    res.status(502).json({ error: `Printify catalog unavailable: ${err?.message ?? "unknown error"}` });
  }
});

// GET /printify/catalog/:blueprintId — blueprint details
router.get("/printify/catalog/:blueprintId", async (req, res) => {
  const blueprintId = Number(req.params.blueprintId as string);
  if (isNaN(blueprintId)) { res.status(400).json({ error: "Invalid blueprint ID" }); return; }
  const blueprint = await getBlueprint(blueprintId);
  res.json(blueprint);
});

// GET /printify/catalog/:blueprintId/providers — print providers for a blueprint
router.get("/printify/catalog/:blueprintId/providers", async (req, res) => {
  const blueprintId = Number(req.params.blueprintId as string);
  if (isNaN(blueprintId)) { res.status(400).json({ error: "Invalid blueprint ID" }); return; }
  const providers = await getBlueprintPrintProviders(blueprintId);
  res.json(providers);
});

// GET /printify/catalog/:blueprintId/providers/:providerId/variants — variants
router.get("/printify/catalog/:blueprintId/providers/:providerId/variants", async (req, res) => {
  const blueprintId = Number(req.params.blueprintId as string);
  const providerId = Number(req.params.providerId as string);
  if (isNaN(blueprintId) || isNaN(providerId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
  const variants = await getVariants(blueprintId, providerId);
  res.json(variants);
});

// POST /printify/products — create a Printify-backed product
const CreatePrintifyProductBody = z.object({
  blueprintId: z.number().int().positive(),
  printProviderId: z.number().int().positive(),
  title: z.string().min(3).max(100),
  description: z.string().max(1000).optional(),
  designUrl: z.string(),
  enabledVariants: z.array(z.object({
    id: z.number().int(),
    color: z.string(),
    size: z.string(),
    priceInCents: z.number().int(),
    cost: z.number().int().optional(),
  })).min(1),
  basePrice: z.number().positive(),
  tags: z.array(z.string()).default([]),
  isLimitedDrop: z.boolean().default(false),
  stockLimit: z.number().int().positive().optional(),
});

router.post("/printify/products", requireAuth, async (req, res) => {
  const creatorId: number = (req as any).userId;
  const parsed = CreatePrintifyProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const data = parsed.data;

  // 1. Floor-price validation (no external API call needed)
  const maxVariantCostCents = Math.max(...data.enabledVariants.map((v) => v.cost ?? v.priceInCents));
  const maxVariantCostDollars = maxVariantCostCents / 100;
  const floorPrice = Number((MERCH_FLOOR_MULT * maxVariantCostDollars).toFixed(2));
  if (data.basePrice < floorPrice) {
    res.status(400).json({
      error: `Retail price must be at least $${floorPrice.toFixed(2)} (${MERCH_FLOOR_MULT}× the highest variant production cost of $${maxVariantCostDollars.toFixed(2)})`,
    });
    return;
  }

  // 2. Projected payout per unit for display — pessimistic (uses max variant cost)
  const projectedCcbillFee = Number((CCBILL_RATE * data.basePrice + CCBILL_FLAT).toFixed(2));
  const projectedMargin = Number((data.basePrice - maxVariantCostDollars - projectedCcbillFee).toFixed(2));
  const projectedPayout = Number(Math.max(0, projectedMargin * MERCH_CREATOR_SHARE).toFixed(2));

  // 3. Derive unique colors and sizes from enabled variants
  const uniqueColors = [...new Set(data.enabledVariants.map((v) => v.color).filter(Boolean))];
  const uniqueSizes = [...new Set(data.enabledVariants.map((v) => v.size).filter(Boolean))];

  // 4. Look up blueprint for product-type classification (non-fatal)
  let productType = "other";
  try {
    const blueprint = await getBlueprint(data.blueprintId);
    productType = blueprintTitleToProductType(blueprint?.title ?? "");
  } catch {
    req.log.warn({ blueprintId: data.blueprintId }, "Blueprint lookup failed — defaulting productType to 'other'");
  }

  // 5. Store enabled variant data for Phase-2 Printify upload on scan-clean
  const printifyVariantsJson = JSON.stringify(
    data.enabledVariants.map((v) => ({
      id: v.id,
      color: v.color,
      size: v.size,
      priceInCents: v.priceInCents,
      cost: v.cost ?? null,
      isEnabled: true,
    }))
  );

  // 6. Insert DB row — scan_status='pending'; Printify upload + product creation are
  //    deferred to the Phase-2 on-clean handler. Nothing is sent to Printify until
  //    the design has cleared the CSAM scanner.
  const [product] = await db.insert(merchProductsTable).values({
    creatorId,
    title: data.title,
    description: data.description,
    productType,
    designUrl: data.designUrl,
    previewImageUrl: data.designUrl,   // placeholder — replaced by Printify mock-up on scan-clean
    colors: uniqueColors,
    sizes: uniqueSizes,
    basePrice: String(data.basePrice),
    creatorProfit: String(projectedPayout),
    tags: data.tags,
    isLimitedDrop: data.isLimitedDrop,
    stockLimit: data.stockLimit,
    printifyBlueprintId: data.blueprintId,
    printifyPrintProviderId: data.printProviderId,
    printifyVariantsJson,
    scanStatus: 'pending',
  }).returning();

  // 7. Fire scan — Phase-2 on-clean handler will upload design and create Printify product
  void scanAsset(product.id, 'merch_product');

  const summaries = await getUserSummaries([creatorId], creatorId);
  res.status(201).json({
    ...product,
    basePrice: Number(product.basePrice),
    creatorProfit: Number(product.creatorProfit),
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
    creator: summaries[creatorId] ?? null,
  });
});

// GET /printify/orders/:orderId — get order status from Printify and sync to DB
router.get("/printify/orders/:orderId", requireAuth, async (req, res) => {
  const printifyOrderId = req.params.orderId as string;

  // Verify the caller owns an order with this fulfillmentId
  const { eq: eqFn, and } = await import("drizzle-orm");
  const { merchOrdersTable } = await import("@workspace/db");
  const callerId: number = (req as any).userId;

  const [localOrder] = await db.select().from(merchOrdersTable).where(
    eqFn(merchOrdersTable.fulfillmentId, printifyOrderId)
  );

  if (!localOrder) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (localOrder.buyerId !== callerId && localOrder.creatorId !== callerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Fetch from Printify
  const product = await db.select().from(merchProductsTable).where(
    eqFn(merchProductsTable.id, localOrder.productId)
  ).then((rows) => rows[0]);

  if (!product?.printifyShopId) {
    res.status(400).json({ error: "This order is not a Printify order" });
    return;
  }

  const printifyOrder = await getOrder(product.printifyShopId, printifyOrderId);

  // Map Printify status to our statuses
  const statusMap: Record<string, string> = {
    pending: "processing",
    "sending-to-production": "processing",
    "in-production": "printing",
    "ready-for-shipping": "printing",
    shipped: "shipped",
    delivered: "delivered",
    cancelled: "cancelled",
    refunded: "cancelled",
  };
  const newStatus = statusMap[printifyOrder.status] ?? localOrder.status;
  const trackingNumber =
    printifyOrder.shipments?.[0]?.tracking_number ?? localOrder.trackingNumber;

  // Sync status back to our DB if it changed
  if (newStatus !== localOrder.status || trackingNumber !== localOrder.trackingNumber) {
    await db.update(merchOrdersTable).set({
      status: newStatus,
      trackingNumber: trackingNumber ?? undefined,
      updatedAt: new Date(),
    }).where(eqFn(merchOrdersTable.id, localOrder.id));
  }

  res.json({
    ...printifyOrder,
    localOrderId: localOrder.id,
    localStatus: newStatus,
    trackingNumber,
  });
});

export default router;
