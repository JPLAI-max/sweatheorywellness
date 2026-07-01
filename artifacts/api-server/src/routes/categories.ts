import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/adminAuth";
import { z } from "zod";

const router: IRouter = Router();

// GET /categories — public, returns all categories ordered by sortOrder
router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  res.json(rows);
});

// POST /admin/categories — admin only, create a new category
router.post("/admin/categories", requireAdmin, async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(80), sortOrder: z.number().int().optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const existing = await db.select().from(categoriesTable).where(eq(categoriesTable.name, body.data.name));
  if (existing.length > 0) { res.status(409).json({ error: "Category already exists" }); return; }

  const [row] = await db
    .insert(categoriesTable)
    .values({ name: body.data.name, sortOrder: body.data.sortOrder ?? 0 })
    .returning();
  res.status(201).json(row);
});

// DELETE /admin/categories/:id — admin only, remove a category
router.delete("/admin/categories/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

export default router;
