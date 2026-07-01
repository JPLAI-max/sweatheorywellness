import { Router, type IRouter } from "express";
import { db, merchProductsTable, merchOrdersTable, walletsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql, inArray, gte, lt, or } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { CCBILL_RATE, CCBILL_FLAT, MERCH_CREATOR_SHARE } from "../lib/fees";
import { sendMerchOrderConfirmation } from "../lib/email";
import { getOrCreateShop, createOrder as printifyCreateOrder, findOrderByExternalId } from "../lib/printify";
import { logger } from "../lib/logger";
import { scanAsset } from "../lib/csam";
import { serveMediaUrl, isValidR2MediaUrl } from "../lib/r2";
import { z } from "zod";

const router: IRouter = Router();

// Fee rate is determined per-order based on creator's account tier (see fees.ts)

const CreateProductBody = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(1000).optional(),
  productType: z.enum(["shirt", "hoodie", "hat", "poster", "sticker", "mug", "tote_bag", "phone_case", "vinyl_cover", "sweatpants"]),
  designUrl: z.string().optional(),
  previewImageUrl: z.string().optional(),
  colors: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  basePrice: z.number().min(1).max(9999),
  creatorProfit: z.number().min(0),
  tags: z.array(z.string()).default([]),
  isLimitedDrop: z.boolean().default(false),
  stockLimit: z.number().int().positive().optional(),
});

const UpdateProductBody = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(1000).optional(),
  designUrl: z.string().optional(),
  previewImageUrl: z.string().optional(),
  colors: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  basePrice: z.number().min(1).optional(),
  creatorProfit: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "draft", "archived"]).optional(),
  isLimitedDrop: z.boolean().optional(),
  stockLimit: z.number().int().positive().nullable().optional(),
});

const CreateOrderBody = z.object({
  productId: z.number().int().positive(),
  color: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().int().min(1).max(10).default(1),
  shippingName: z.string().min(1),
  shippingAddress: z.string().min(1),
  shippingCity: z.string().min(1),
  shippingState: z.string().min(1),
  shippingZip: z.string().min(1),
  shippingCountry: z.string().default("US"),
  idempotencyKey: z.string().uuid(),
});

async function enrichProducts(products: any[], viewerId?: number) {
  if (products.length === 0) return [];
  const creatorIds = [...new Set(products.map((p: any) => p.creatorId as number))];
  const summaries = await getUserSummaries(creatorIds, viewerId);
  return Promise.all(products.map(async (p: any) => ({
    ...p,
    basePrice: Number(p.basePrice),
    creatorProfit: Number(p.creatorProfit),
    designUrl: p.designUrl ? await serveMediaUrl(p.designUrl) : null,
    previewImageUrl: p.previewImageUrl ? await serveMediaUrl(p.previewImageUrl) : null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
    creator: summaries[p.creatorId] ?? null,
  })));
}

// GET /merch/products — marketplace browse
router.get("/merch/products", optionalAuth, async (req, res) => {
  const viewerId: number | undefined = (req as any).userId;
  const creatorId = req.query.creatorId ? Number(req.query.creatorId) : undefined;
  const productType = req.query.productType as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 24, 50);
  const offset = Number(req.query.offset) || 0;

  const conditions: any[] = [eq(merchProductsTable.status, "active"), eq(merchProductsTable.scanStatus, 'clean')];
  if (creatorId) conditions.push(eq(merchProductsTable.creatorId, creatorId));
  if (productType) conditions.push(eq(merchProductsTable.productType, productType));

  const products = await db
    .select()
    .from(merchProductsTable)
    .where(and(...conditions))
    .orderBy(desc(merchProductsTable.isFeatured), desc(merchProductsTable.salesCount), desc(merchProductsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(await enrichProducts(products, viewerId));
});

// POST /merch/products — create product
router.post("/merch/products", requireAuth, async (req, res) => {
  const creatorId: number = (req as any).userId;
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const data = parsed.data;
  if (data.designUrl && !isValidR2MediaUrl(data.designUrl)) { res.status(400).json({ error: "designUrl must point to a valid R2 media object" }); return; }
  if (data.previewImageUrl && !isValidR2MediaUrl(data.previewImageUrl)) { res.status(400).json({ error: "previewImageUrl must point to a valid R2 media object" }); return; }
  const productHasMedia = !!(data.designUrl || data.previewImageUrl);
  const [product] = await db.insert(merchProductsTable).values({
    creatorId,
    title: data.title,
    description: data.description,
    productType: data.productType,
    designUrl: data.designUrl,
    previewImageUrl: data.previewImageUrl,
    colors: data.colors,
    sizes: data.sizes,
    basePrice: String(data.basePrice),
    creatorProfit: String(data.creatorProfit),
    tags: data.tags,
    isLimitedDrop: data.isLimitedDrop,
    stockLimit: data.stockLimit,
    scanStatus: productHasMedia ? 'pending' : 'clean',
  }).returning();

  if (productHasMedia) {
    void scanAsset(product.id, 'merch_product');
  }

  const [enriched] = await enrichProducts([product], creatorId);
  res.status(201).json(enriched);
});

// GET /merch/products/:id — get product
router.get("/merch/products/:id", optionalAuth, async (req, res) => {
  const viewerId: number | undefined = (req as any).userId;
  const isAdmin = (req as any).user?.isAdmin === true;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  // Owner and admin can view their own pending products (view-only — order gate unchanged)
  const [product] = await db.select().from(merchProductsTable)
    .where(and(
      eq(merchProductsTable.id, id),
      or(
        eq(merchProductsTable.scanStatus, 'clean'),
        isAdmin ? sql`true` : sql`false`,
        viewerId != null ? eq(merchProductsTable.creatorId, viewerId) : sql`false`,
      )
    ));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [enriched] = await enrichProducts([product], viewerId);
  res.json(enriched);
});

// PUT /merch/products/:id — update product
router.put("/merch/products/:id", requireAuth, async (req, res) => {
  const userId: number = (req as any).userId;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  if (parsed.data.designUrl && !isValidR2MediaUrl(parsed.data.designUrl)) { res.status(400).json({ error: "designUrl must point to a valid R2 media object" }); return; }
  if (parsed.data.previewImageUrl && !isValidR2MediaUrl(parsed.data.previewImageUrl)) { res.status(400).json({ error: "previewImageUrl must point to a valid R2 media object" }); return; }

  const [existing] = await db.select().from(merchProductsTable).where(eq(merchProductsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (existing.creatorId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = parsed.data;
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.designUrl !== undefined) updateData.designUrl = data.designUrl;
  if (data.previewImageUrl !== undefined) updateData.previewImageUrl = data.previewImageUrl;
  if (data.colors !== undefined) updateData.colors = data.colors;
  if (data.sizes !== undefined) updateData.sizes = data.sizes;
  if (data.basePrice !== undefined) updateData.basePrice = String(data.basePrice);
  if (data.creatorProfit !== undefined) updateData.creatorProfit = String(data.creatorProfit);
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.isLimitedDrop !== undefined) updateData.isLimitedDrop = data.isLimitedDrop;
  if (data.stockLimit !== undefined) updateData.stockLimit = data.stockLimit;

  // Re-quarantine if any media field is being changed
  const touchesMerchMedia = data.designUrl !== undefined || data.previewImageUrl !== undefined;
  if (touchesMerchMedia) {
    const resultDesign = data.designUrl !== undefined ? data.designUrl : (await db.select({ designUrl: merchProductsTable.designUrl, previewImageUrl: merchProductsTable.previewImageUrl }).from(merchProductsTable).where(eq(merchProductsTable.id, id)).limit(1))[0];
    const resultDesignUrl = data.designUrl !== undefined ? data.designUrl : (resultDesign as any)?.designUrl;
    const resultPreviewUrl = data.previewImageUrl !== undefined ? data.previewImageUrl : (resultDesign as any)?.previewImageUrl;
    const resultHasMedia = !!(resultDesignUrl || resultPreviewUrl);
    updateData.scanStatus = resultHasMedia ? 'pending' : 'clean';
  }

  const [updated] = await db.update(merchProductsTable).set(updateData).where(eq(merchProductsTable.id, id)).returning();

  if (touchesMerchMedia && updated.scanStatus === 'pending') {
    void scanAsset(updated.id, 'merch_product');
  }

  const [enriched] = await enrichProducts([updated], userId);
  res.json(enriched);
});

// DELETE /merch/products/:id — delete product
router.delete("/merch/products/:id", requireAuth, async (req, res) => {
  const userId: number = (req as any).userId;
  const id = Number(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const [existing] = await db.select().from(merchProductsTable).where(eq(merchProductsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (existing.creatorId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.update(merchProductsTable).set({ status: "archived" }).where(eq(merchProductsTable.id, id));
  res.json({ ok: true });
});

// GET /merch/storefront/:userId — creator storefront
router.get("/merch/storefront/:userId", optionalAuth, async (req, res) => {
  const viewerId: number | undefined = (req as any).userId;
  const targetUserId = Number(req.params.userId as string);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const products = await db
    .select()
    .from(merchProductsTable)
    .where(and(eq(merchProductsTable.creatorId, targetUserId), eq(merchProductsTable.status, "active"), eq(merchProductsTable.scanStatus, 'clean')))
    .orderBy(desc(merchProductsTable.isFeatured), desc(merchProductsTable.salesCount), desc(merchProductsTable.createdAt));

  res.json(await enrichProducts(products, viewerId));
});

// POST /merch/orders — place order
router.post("/merch/orders", requireAuth, async (req, res) => {
  const buyerId: number = (req as any).userId;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const data = parsed.data;

  const [product] = await db.select().from(merchProductsTable).where(
    and(
      eq(merchProductsTable.id, data.productId),
      eq(merchProductsTable.status, "active"),
      eq(merchProductsTable.scanStatus, 'clean'),
    )
  );
  if (!product) {
    res.status(404).json({ error: "Product not found or unavailable" });
    return;
  }
  if (product.creatorId === buyerId) {
    res.status(400).json({ error: "Cannot buy your own product" });
    return;
  }

  // Physical merch must have a Printify link — reject before charging anyone
  if (!product.printifyProductId || !product.printifyShopId) {
    res.status(400).json({ error: "This product is not configured for fulfillment and cannot be ordered" });
    return;
  }

  // Idempotency: return existing order immediately if this key was already processed
  const [existingOrder] = await db.select().from(merchOrdersTable)
    .where(eq(merchOrdersTable.idempotencyKey, data.idempotencyKey));
  if (existingOrder) {
    if (existingOrder.buyerId !== buyerId) {
      res.status(409).json({ error: "Conflict" });
      return;
    }
    res.status(200).json({
      ...existingOrder,
      unitPrice: Number(existingOrder.unitPrice),
      totalAmount: Number(existingOrder.totalAmount),
      platformFee: Number(existingOrder.platformFee),
      creatorPayout: Number(existingOrder.creatorPayout),
      createdAt: existingOrder.createdAt instanceof Date ? existingOrder.createdAt.toISOString() : existingOrder.createdAt,
      updatedAt: existingOrder.updatedAt instanceof Date ? existingOrder.updatedAt.toISOString() : existingOrder.updatedAt,
    });
    return;
  }

  const localFulfillmentId = `POD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // Outer vars populated by TX1; used in TX2 / TX2' after Printify responds.
  // printifyProductId / printifyShopId captured from the LOCKED row to prevent
  // TOCTOU: a concurrent product edit cannot swap the IDs after TX1 validates them.
  let order: typeof merchOrdersTable.$inferSelect;
  let variantId: number;
  let totalAmount: number;
  let creatorPayout: number;
  let platformFee: number;
  let lockedPrintifyProductId: string;

  // ── TX1: validate, debit buyer, record order as pending_fulfillment ────────
  try {
    ({ order, variantId, totalAmount, creatorPayout, platformFee,
       printifyProductId: lockedPrintifyProductId } = await db.transaction(async (tx) => {
      // Lock product to prevent concurrent overselling
      const [lockedProduct] = await tx.select().from(merchProductsTable)
        .where(and(eq(merchProductsTable.id, data.productId), eq(merchProductsTable.status, "active")))
        .for("update");

      if (!lockedProduct) {
        const err = new Error("Product not found or unavailable") as any;
        err.code = "PRODUCT_UNAVAILABLE";
        throw err;
      }

      // TOCTOU: re-assert scan gate and fulfillment readiness on the LOCKED row —
      // a concurrent PUT may have re-quarantined the product between the outer
      // check and this lock acquisition.
      if (lockedProduct.scanStatus !== 'clean') {
        const err = new Error("Product is not available for purchase") as any;
        err.code = "PRODUCT_UNAVAILABLE";
        throw err;
      }
      if (lockedProduct.printifyProductId == null) {
        const err = new Error("Product is not configured for fulfillment") as any;
        err.code = "PRODUCT_UNAVAILABLE";
        throw err;
      }

      if (lockedProduct.isLimitedDrop && lockedProduct.stockLimit !== null && lockedProduct.stockLimit !== undefined) {
        const remaining = lockedProduct.stockLimit - lockedProduct.salesCount;
        if (remaining < data.quantity) {
          const err = new Error("Insufficient stock for limited-drop item") as any;
          err.code = "OUT_OF_STOCK";
          throw err;
        }
      }

      // UNITS: basePrice → dollars (DB numeric), printifyCost → cents (integer)
      const _unitPrice = Number(lockedProduct.basePrice);
      const _totalAmount = Number((_unitPrice * data.quantity).toFixed(2));

      // Resolve variant ID + production cost from JSON in one pass — both BLOCKING
      let _variantId: number | undefined;
      let _printifyCost: number | null = null;
      if (lockedProduct.printifyVariantsJson) {
        try {
          const variants: Array<{ id: number; color: string; size: string; cost?: number | null }> =
            JSON.parse(lockedProduct.printifyVariantsJson);
          const matched =
            variants.find((v) => v.color === data.color && v.size === data.size) ??
            variants.find((v) => v.size === data.size) ??
            variants.find((v) => v.color === data.color) ??
            variants[0];
          _variantId = matched?.id;
          if (matched?.cost != null) _printifyCost = matched.cost;
        } catch { /* handled below */ }
      }
      if (!_variantId) {
        const err = new Error("No matching Printify variant found for the selected color/size") as any;
        err.code = "NO_VARIANT";
        throw err;
      }
      if (_printifyCost == null) {
        req.log.error({ productId: lockedProduct.id }, "printifyCost missing — rejecting order");
        const err = new Error("Product cost data is unavailable; order cannot be placed") as any;
        err.code = "MISSING_COST";
        throw err;
      }

      // Margin-split math — all dollars; printifyCost cents → dollars
      const _totalCostDollars = (_printifyCost / 100) * data.quantity;
      const _ccbillFeeDollars = Number((CCBILL_RATE * _totalAmount + CCBILL_FLAT).toFixed(2));
      const _marginDollars = Number((_totalAmount - _totalCostDollars - _ccbillFeeDollars).toFixed(2));

      if (_marginDollars <= 0) {
        req.log.error({ productId: lockedProduct.id, marginDollars: _marginDollars }, "Non-positive margin — rejecting merch order");
        const err = new Error("Order margin is zero or negative; order cannot be placed") as any;
        err.code = "NEGATIVE_MARGIN";
        throw err;
      }

      const _creatorPayout = Number((_marginDollars * MERCH_CREATOR_SHARE).toFixed(2));
      const _platformFee = Number((_marginDollars - _creatorPayout).toFixed(2));

      // Debit buyer atomically
      const [wallet] = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${String(_totalAmount)}`,
          totalSpent: sql`${walletsTable.totalSpent} + ${String(_totalAmount)}`,
        })
        .where(and(eq(walletsTable.userId, buyerId), gte(walletsTable.balance, String(_totalAmount))))
        .returning();

      if (!wallet) {
        const err = new Error("Insufficient wallet balance") as any;
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      // Buyer purchase transaction — pending until Printify confirms; ID stored on order for precise later update
      const [buyerTxn] = await tx.insert(transactionsTable).values({
        userId: buyerId,
        type: "purchase",
        amount: String(_totalAmount),
        fee: String(_platformFee),
        status: "pending",
        description: `Merch purchase: ${lockedProduct.title}`,
        relatedUserId: lockedProduct.creatorId,
      }).returning({ id: transactionsTable.id });

      await tx.update(merchProductsTable)
        .set({ salesCount: sql`${merchProductsTable.salesCount} + ${data.quantity}` })
        .where(eq(merchProductsTable.id, lockedProduct.id));

      const [_order] = await tx.insert(merchOrdersTable).values({
        buyerId,
        creatorId: lockedProduct.creatorId,
        productId: lockedProduct.id,
        productTitle: lockedProduct.title,
        productType: lockedProduct.productType,
        designUrl: lockedProduct.designUrl,
        color: data.color,
        size: data.size,
        quantity: data.quantity,
        unitPrice: String(_unitPrice),
        totalAmount: String(_totalAmount),
        platformFee: String(_platformFee),
        creatorPayout: String(_creatorPayout),
        shippingName: data.shippingName,
        shippingAddress: data.shippingAddress,
        shippingCity: data.shippingCity,
        shippingState: data.shippingState,
        shippingZip: data.shippingZip,
        shippingCountry: data.shippingCountry,
        status: "pending_fulfillment",
        fulfillmentId: localFulfillmentId,
        printifyCost: _printifyCost,
        ccbillFee: Math.round(_ccbillFeeDollars * 100),
        margin: Math.round(_marginDollars * 100),
        idempotencyKey: data.idempotencyKey,
        buyerTxnId: buyerTxn.id,
      }).returning();

      return {
        order: _order,
        variantId: _variantId,
        totalAmount: _totalAmount,
        creatorPayout: _creatorPayout,
        platformFee: _platformFee,
        // Capture printifyProductId from the LOCKED row so the Printify call
        // cannot race with a concurrent product update that swaps it after TX1 exits.
        printifyProductId: lockedProduct.printifyProductId as string,
      };
    }));
  } catch (e: any) {
    // Unique constraint on idempotency_key = concurrent request raced us; return the existing order
    if (e.code === "23505") {
      const [existing] = await db.select().from(merchOrdersTable)
        .where(eq(merchOrdersTable.idempotencyKey, data.idempotencyKey));
      if (existing) {
        if (existing.buyerId !== buyerId) {
          res.status(409).json({ error: "Conflict" });
          return;
        }
        res.status(200).json({
          ...existing,
          unitPrice: Number(existing.unitPrice),
          totalAmount: Number(existing.totalAmount),
          platformFee: Number(existing.platformFee),
          creatorPayout: Number(existing.creatorPayout),
          createdAt: existing.createdAt instanceof Date ? existing.createdAt.toISOString() : existing.createdAt,
          updatedAt: existing.updatedAt instanceof Date ? existing.updatedAt.toISOString() : existing.updatedAt,
        });
        return;
      }
    }
    if (e.code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }
    if (e.code === "OUT_OF_STOCK") {
      res.status(409).json({ error: "Insufficient stock for limited-drop item" });
      return;
    }
    if (e.code === "PRODUCT_UNAVAILABLE") {
      res.status(404).json({ error: "Product not found or unavailable" });
      return;
    }
    if (e.code === "MISSING_COST") {
      res.status(400).json({ error: "Product cost data is unavailable; order cannot be placed" });
      return;
    }
    if (e.code === "NEGATIVE_MARGIN") {
      res.status(400).json({ error: "Order margin is zero or negative; order cannot be placed" });
      return;
    }
    if (e.code === "NO_VARIANT") {
      res.status(400).json({ error: "No matching Printify variant found for the selected color/size" });
      return;
    }
    throw e;
  }

  // ── Buyer info (needed for Printify address + confirmation email) ──────────
  const [buyer] = await db.select({ email: usersTable.email, username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, buyerId)).limit(1);

  const nameParts = data.shippingName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? data.shippingName;
  const lastName = nameParts.slice(1).join(" ") || "-";

  // ── AWAIT Printify — blocking; fund distribution depends on this result ────
  let printifyOrderId: string | undefined;
  try {
    const shopId = await getOrCreateShop();
    const printifyOrder = await printifyCreateOrder(shopId, {
      external_id: String(order.id),
      label: `Sweatheory Order #${order.id}`,
      line_items: [
        {
          // Use the ID captured from the LOCKED row in TX1, not the stale pre-lock read.
          product_id: lockedPrintifyProductId,
          variant_id: variantId,
          quantity: data.quantity,
        },
      ],
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: firstName,
        last_name: lastName,
        email: buyer?.email ?? "",
        phone: "",
        country: data.shippingCountry,
        region: data.shippingState,
        address1: data.shippingAddress,
        address2: "",
        city: data.shippingCity,
        zip: data.shippingZip,
      },
    });
    printifyOrderId = String(printifyOrder.id);
    req.log.info({ printifyOrderId, orderId: order.id }, "Printify order submitted successfully");
    // Persist Printify ID immediately — a crash between here and TX2 still leaves the ID recoverable
    await db.update(merchOrdersTable)
      .set({ fulfillmentId: printifyOrderId, updatedAt: new Date() })
      .where(eq(merchOrdersTable.id, order.id));
  } catch (e) {
    req.log.error({ err: e, orderId: order.id }, "Printify order submission failed — refunding buyer");
  }

  if (printifyOrderId) {
    // ── TX2: credit creator, finalize (idempotent: guard on pending_fulfillment) ──
    await db.transaction(async (tx) => {
      const [lockedOrder] = await tx.select().from(merchOrdersTable)
        .where(eq(merchOrdersTable.id, order.id))
        .for("update");
      if (!lockedOrder || lockedOrder.status !== "pending_fulfillment") return;

      const [creatorWallet] = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, order.creatorId));
      if (creatorWallet) {
        await tx.update(walletsTable)
          .set({
            balance: sql`${walletsTable.balance} + ${String(creatorPayout)}`,
            totalEarned: sql`${walletsTable.totalEarned} + ${String(creatorPayout)}`,
          })
          .where(eq(walletsTable.userId, order.creatorId));
      } else {
        await tx.insert(walletsTable).values({
          userId: order.creatorId,
          balance: String(creatorPayout),
          totalEarned: String(creatorPayout),
        });
      }

      await tx.insert(transactionsTable).values({
        userId: order.creatorId,
        type: "deposit",
        amount: String(creatorPayout),
        fee: "0",
        status: "completed",
        description: `Merch sale: ${order.productTitle}`,
        relatedUserId: buyerId,
      });

      if (order.buyerTxnId != null) {
        await tx.update(transactionsTable)
          .set({ status: "completed" })
          .where(eq(transactionsTable.id, order.buyerTxnId));
      }

      await tx.update(merchOrdersTable)
        .set({ fulfillmentId: printifyOrderId, status: "printing", updatedAt: new Date() })
        .where(eq(merchOrdersTable.id, order.id));

      order = { ...order, fulfillmentId: printifyOrderId, status: "printing" };
    });

    if (buyer) {
      sendMerchOrderConfirmation({
        to: buyer.email,
        buyerUsername: buyer.username,
        productTitle: order.productTitle,
        productType: order.productType,
        color: data.color,
        size: data.size,
        quantity: data.quantity,
        totalAmount: Number(order.totalAmount),
        fulfillmentId: printifyOrderId,
        shippingName: data.shippingName,
        shippingCity: data.shippingCity,
        shippingState: data.shippingState,
      });
    }

    res.status(201).json({
      ...order,
      unitPrice: Number(order.unitPrice),
      totalAmount: Number(order.totalAmount),
      platformFee: Number(order.platformFee),
      creatorPayout: Number(order.creatorPayout),
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
      updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
    });
  } else {
    // ── TX2': refund buyer, mark failed (idempotent: guard on pending_fulfillment) ──
    await db.transaction(async (tx) => {
      const [lockedOrder] = await tx.select().from(merchOrdersTable)
        .where(eq(merchOrdersTable.id, order.id))
        .for("update");
      if (!lockedOrder || lockedOrder.status !== "pending_fulfillment") return;

      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${String(totalAmount)}`,
          totalSpent: sql`${walletsTable.totalSpent} - ${String(totalAmount)}`,
        })
        .where(eq(walletsTable.userId, buyerId));

      if (order.buyerTxnId != null) {
        await tx.update(transactionsTable)
          .set({ status: "failed" })
          .where(eq(transactionsTable.id, order.buyerTxnId));
      }

      await tx.insert(transactionsTable).values({
        userId: buyerId,
        type: "deposit",
        amount: String(totalAmount),
        fee: "0",
        status: "completed",
        description: `Refund: fulfillment failed for ${order.productTitle}`,
        relatedUserId: order.creatorId,
      });

      await tx.update(merchProductsTable)
        .set({ salesCount: sql`${merchProductsTable.salesCount} - ${data.quantity}` })
        .where(eq(merchProductsTable.id, order.productId));

      await tx.update(merchOrdersTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(merchOrdersTable.id, order.id));
    });

    res.status(502).json({ error: "Failed to submit order to fulfillment provider; your payment has been refunded" });
  }
});

// GET /merch/orders/my — buyer's orders
router.get("/merch/orders/my", requireAuth, async (req, res) => {
  const buyerId: number = (req as any).userId;

  const orders = await db
    .select()
    .from(merchOrdersTable)
    .where(eq(merchOrdersTable.buyerId, buyerId))
    .orderBy(desc(merchOrdersTable.createdAt));

  const productIds = [...new Set(orders.map((o) => o.productId))];
  const products = productIds.length > 0
    ? await db.select().from(merchProductsTable).where(inArray(merchProductsTable.id, productIds))
    : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const creatorIds = [...new Set(orders.map((o) => o.creatorId))];
  const summaries = creatorIds.length > 0 ? await getUserSummaries(creatorIds, buyerId) : {};

  res.json(orders.map((o) => ({
    ...o,
    unitPrice: Number(o.unitPrice),
    totalAmount: Number(o.totalAmount),
    platformFee: Number(o.platformFee),
    creatorPayout: Number(o.creatorPayout),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    creator: summaries[o.creatorId] ?? null,
    product: productMap[o.productId] ? {
      ...productMap[o.productId],
      basePrice: Number(productMap[o.productId]!.basePrice),
    } : null,
  })));
});

// GET /merch/orders/sales — creator's sales
router.get("/merch/orders/sales", requireAuth, async (req, res) => {
  const creatorId: number = (req as any).userId;

  const orders = await db
    .select()
    .from(merchOrdersTable)
    .where(eq(merchOrdersTable.creatorId, creatorId))
    .orderBy(desc(merchOrdersTable.createdAt));

  const buyerIds = [...new Set(orders.map((o) => o.buyerId))];
  const summaries = buyerIds.length > 0 ? await getUserSummaries(buyerIds, creatorId) : {};

  res.json(orders.map((o) => ({
    ...o,
    unitPrice: Number(o.unitPrice),
    totalAmount: Number(o.totalAmount),
    platformFee: Number(o.platformFee),
    creatorPayout: Number(o.creatorPayout),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    buyer: summaries[o.buyerId] ?? null,
  })));
});

// ── Reconcile: resolve orders stuck in pending_fulfillment ────────────────────
// Called on startup and every 10 minutes. Also callable on-demand via admin route.
// NOTE: setInterval assumes a persistent process (Replit). Swap to real cron on serverless.

export async function reconcileStuckMerchOrders(): Promise<{ processed: number; reconciled: number; inconclusive: number }> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000); // orders older than 10 minutes
  const stuck = await db.select().from(merchOrdersTable)
    .where(and(
      eq(merchOrdersTable.status, "pending_fulfillment"),
      lt(merchOrdersTable.createdAt, cutoff),
    ));

  let processed = 0, reconciled = 0, inconclusive = 0;

  for (const stuckOrder of stuck) {
    processed++;
    const orderId = stuckOrder.id;
    const buyerId = stuckOrder.buyerId;
    const totalAmount = Number(stuckOrder.totalAmount);
    const creatorPayout = Number(stuckOrder.creatorPayout);

    try {
      // Determine whether a real Printify order ID is already on the row
      let printifyOrderId: string | undefined =
        stuckOrder.fulfillmentId && !stuckOrder.fulfillmentId.startsWith("POD-")
          ? stuckOrder.fulfillmentId
          : undefined;

      if (!printifyOrderId) {
        const shopId = await getOrCreateShop();
        const result = await findOrderByExternalId(shopId, String(orderId));

        if (result.status === "inconclusive") {
          logger.warn({ orderId }, "Merch reconcile: Printify lookup inconclusive — leaving pending, needs admin review");
          inconclusive++;
          continue;
        }

        if (result.status === "found") {
          printifyOrderId = String(result.order.id);
          // Persist before entering TX2 so a second crash still recovers
          await db.update(merchOrdersTable)
            .set({ fulfillmentId: printifyOrderId, updatedAt: new Date() })
            .where(eq(merchOrdersTable.id, orderId));
        }
        // "not_found" → printifyOrderId stays undefined → TX2' path below
      }

      if (printifyOrderId) {
        // ── TX2 path: credit creator, mark "printing" ──────────────────────
        await db.transaction(async (tx) => {
          const [order] = await tx.select().from(merchOrdersTable)
            .where(eq(merchOrdersTable.id, orderId)).for("update");
          if (!order || order.status !== "pending_fulfillment") return;

          const [creatorWallet] = await tx.select().from(walletsTable)
            .where(eq(walletsTable.userId, order.creatorId));
          if (creatorWallet) {
            await tx.update(walletsTable)
              .set({
                balance: sql`${walletsTable.balance} + ${String(creatorPayout)}`,
                totalEarned: sql`${walletsTable.totalEarned} + ${String(creatorPayout)}`,
              })
              .where(eq(walletsTable.userId, order.creatorId));
          } else {
            await tx.insert(walletsTable).values({
              userId: order.creatorId,
              balance: String(creatorPayout),
              totalEarned: String(creatorPayout),
            });
          }

          await tx.insert(transactionsTable).values({
            userId: order.creatorId,
            type: "deposit",
            amount: String(creatorPayout),
            fee: "0",
            status: "completed",
            description: `Merch sale: ${order.productTitle}`,
            relatedUserId: buyerId,
          });

          if (order.buyerTxnId != null) {
            await tx.update(transactionsTable)
              .set({ status: "completed" })
              .where(eq(transactionsTable.id, order.buyerTxnId));
          }

          await tx.update(merchOrdersTable)
            .set({ fulfillmentId: printifyOrderId, status: "printing", updatedAt: new Date() })
            .where(eq(merchOrdersTable.id, orderId));
        });

        logger.info({ orderId, printifyOrderId }, "Merch reconcile: finalized via TX2 (printing)");
        reconciled++;
      } else {
        // ── TX2' path: refund buyer, mark "failed" ─────────────────────────
        await db.transaction(async (tx) => {
          const [order] = await tx.select().from(merchOrdersTable)
            .where(eq(merchOrdersTable.id, orderId)).for("update");
          if (!order || order.status !== "pending_fulfillment") return;

          await tx.update(walletsTable)
            .set({
              balance: sql`${walletsTable.balance} + ${String(totalAmount)}`,
              totalSpent: sql`${walletsTable.totalSpent} - ${String(totalAmount)}`,
            })
            .where(eq(walletsTable.userId, buyerId));

          if (order.buyerTxnId != null) {
            await tx.update(transactionsTable)
              .set({ status: "failed" })
              .where(eq(transactionsTable.id, order.buyerTxnId));
          }

          await tx.insert(transactionsTable).values({
            userId: buyerId,
            type: "deposit",
            amount: String(totalAmount),
            fee: "0",
            status: "completed",
            description: `Refund: fulfillment failed for ${order.productTitle}`,
            relatedUserId: order.creatorId,
          });

          await tx.update(merchProductsTable)
            .set({ salesCount: sql`${merchProductsTable.salesCount} - ${order.quantity}` })
            .where(eq(merchProductsTable.id, order.productId));

          await tx.update(merchOrdersTable)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(merchOrdersTable.id, orderId));
        });

        logger.warn({ orderId }, "Merch reconcile: refunded via TX2' (Printify order not found)");
        reconciled++;
      }
    } catch (err) {
      logger.error({ err, orderId }, "Merch reconcile: unexpected error — leaving order pending");
      inconclusive++;
    }
  }

  return { processed, reconciled, inconclusive };
}

export default router;
