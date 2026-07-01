import { Router, type IRouter } from "express";
import { db, shopItemsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/adminAuth";
import { serveMediaUrl } from "../lib/r2";
import { z } from "zod";

const router: IRouter = Router();

// GET /shop-items — public, returns all active shop items ordered by position
// commission is intentionally excluded from this response (admin-only field)
// imageUrl is passed through serveMediaUrl so R2 keys become fresh presigned URLs
router.get("/shop-items", async (_req, res) => {
  const rows = await db
    .select({
      id: shopItemsTable.id,
      type: shopItemsTable.type,
      title: shopItemsTable.title,
      subtitle: shopItemsTable.subtitle,
      imageUrl: shopItemsTable.imageUrl,
      affiliateUrl: shopItemsTable.affiliateUrl,
      category: shopItemsTable.category,
      badge: shopItemsTable.badge,
      isActive: shopItemsTable.isActive,
      position: shopItemsTable.position,
      createdAt: shopItemsTable.createdAt,
    })
    .from(shopItemsTable)
    .where(eq(shopItemsTable.isActive, true))
    .orderBy(asc(shopItemsTable.position), asc(shopItemsTable.createdAt));

  const enriched = await Promise.all(
    rows.map(async (row) => ({ ...row, imageUrl: await serveMediaUrl(row.imageUrl) })),
  );
  res.json(enriched);
});

const shopItemSchema = z.object({
  type: z.enum(["brand", "creator_pick"]).default("brand"),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().max(2048).optional(),
  affiliateUrl: z.string().url().optional().or(z.literal("")),
  category: z.string().max(60).optional(),
  badge: z.string().max(40).optional(),
  commission: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().optional(),
});

// POST /admin/shop-items — admin only
router.post("/admin/shop-items", requireAdmin, async (req, res) => {
  const body = shopItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db
    .insert(shopItemsTable)
    .values({
      type: body.data.type,
      title: body.data.title,
      subtitle: body.data.subtitle ?? null,
      imageUrl: body.data.imageUrl || null,
      affiliateUrl: body.data.affiliateUrl || null,
      category: body.data.category ?? null,
      badge: body.data.badge ?? null,
      commission: body.data.commission ?? null,
      isActive: body.data.isActive ?? true,
      position: body.data.position ?? 0,
    })
    .returning();
  res.status(201).json(row);
});

// PATCH /admin/shop-items/:id — admin only, update a shop item
router.patch("/admin/shop-items/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = shopItemSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [updated] = await db
    .update(shopItemsTable)
    .set({
      ...body.data,
      imageUrl: body.data.imageUrl !== undefined ? (body.data.imageUrl || null) : undefined,
      affiliateUrl: body.data.affiliateUrl !== undefined ? (body.data.affiliateUrl || null) : undefined,
    })
    .where(eq(shopItemsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// DELETE /admin/shop-items/:id — admin only
router.delete("/admin/shop-items/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(shopItemsTable).where(eq(shopItemsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

export default router;
