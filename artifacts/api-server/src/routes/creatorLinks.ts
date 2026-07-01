import { Router, type IRouter } from "express";
import { db, creatorLinksTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { z } from "zod/v4";
import { createLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();

const MAX_LINKS = 20;

const UrlSchema = z.string().url().max(500).refine(u => u.startsWith("http://") || u.startsWith("https://"), {
  message: "URL must start with http:// or https://",
});

const CreateLinkBody = z.object({
  title: z.string().min(1).max(80),
  url: UrlSchema,
  icon: z.string().max(10).optional(),
});

const UpdateLinkBody = z.object({
  title: z.string().min(1).max(80).optional(),
  url: UrlSchema.optional(),
  icon: z.string().max(10).nullable().optional(),
  isActive: z.boolean().optional(),
});

const ReorderBody = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(MAX_LINKS),
});

// ─── GET /api/creator-links — current user's links ───────────────────────────

router.get("/creator-links", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const links = await db.select()
    .from(creatorLinksTable)
    .where(eq(creatorLinksTable.userId, userId))
    .orderBy(asc(creatorLinksTable.position));
  res.json(links);
});

// ─── GET /api/creator-links/public/:userId — public active links ──────────────

router.get("/creator-links/public/:userId", optionalAuth, async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const links = await db.select()
    .from(creatorLinksTable)
    .where(and(eq(creatorLinksTable.userId, userId), eq(creatorLinksTable.isActive, true)))
    .orderBy(asc(creatorLinksTable.position));
  res.json(links);
});

// ─── POST /api/creator-links — create link ────────────────────────────────────

router.post("/creator-links", requireAuth, createLimiter, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = CreateLinkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select({ id: creatorLinksTable.id })
    .from(creatorLinksTable)
    .where(eq(creatorLinksTable.userId, userId));
  if (existing.length >= MAX_LINKS) {
    res.status(400).json({ error: `Maximum of ${MAX_LINKS} links allowed.` }); return;
  }

  const position = existing.length; // append at end

  const [link] = await db.insert(creatorLinksTable).values({
    userId,
    title: parsed.data.title,
    url: parsed.data.url,
    position,
    icon: parsed.data.icon ?? null,
  }).returning();

  res.status(201).json(link);
});

// ─── PATCH /api/creator-links/reorder — reorder links ────────────────────────

router.patch("/creator-links/reorder", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = ReorderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { orderedIds } = parsed.data;

  // Verify all IDs belong to this user
  const userLinks = await db.select({ id: creatorLinksTable.id })
    .from(creatorLinksTable)
    .where(eq(creatorLinksTable.userId, userId));
  const userLinkIds = new Set(userLinks.map(l => l.id));
  if (!orderedIds.every(id => userLinkIds.has(id))) {
    res.status(403).json({ error: "One or more links do not belong to you" }); return;
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(creatorLinksTable)
        .set({ position: i })
        .where(and(eq(creatorLinksTable.id, orderedIds[i]), eq(creatorLinksTable.userId, userId)));
    }
  });

  const links = await db.select()
    .from(creatorLinksTable)
    .where(eq(creatorLinksTable.userId, userId))
    .orderBy(asc(creatorLinksTable.position));
  res.json(links);
});

// ─── PATCH /api/creator-links/:id — update link ───────────────────────────────

router.patch("/creator-links/:id", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params as { id: string };
  const parsed = UpdateLinkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select()
    .from(creatorLinksTable)
    .where(and(eq(creatorLinksTable.id, id), eq(creatorLinksTable.userId, userId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Link not found" }); return; }

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.url !== undefined) update.url = parsed.data.url;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;

  const [updated] = await db.update(creatorLinksTable)
    .set(update)
    .where(and(eq(creatorLinksTable.id, id), eq(creatorLinksTable.userId, userId)))
    .returning();
  res.json(updated);
});

// ─── DELETE /api/creator-links/:id — delete link ─────────────────────────────

router.delete("/creator-links/:id", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params as { id: string };

  const [existing] = await db.select({ id: creatorLinksTable.id })
    .from(creatorLinksTable)
    .where(and(eq(creatorLinksTable.id, id), eq(creatorLinksTable.userId, userId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Link not found" }); return; }

  await db.delete(creatorLinksTable)
    .where(and(eq(creatorLinksTable.id, id), eq(creatorLinksTable.userId, userId)));

  // Re-sequence positions for remaining links
  const remaining = await db.select({ id: creatorLinksTable.id })
    .from(creatorLinksTable)
    .where(eq(creatorLinksTable.userId, userId))
    .orderBy(asc(creatorLinksTable.position));
  await db.transaction(async (tx) => {
    for (let i = 0; i < remaining.length; i++) {
      await tx.update(creatorLinksTable).set({ position: i }).where(eq(creatorLinksTable.id, remaining[i].id));
    }
  });

  res.json({ ok: true });
});

// ─── POST /api/creator-links/:id/click — increment click count ───────────────

router.post("/creator-links/:id/click", async (req, res) => {
  const { id } = req.params as { id: string };
  // Fire-and-forget: do not await, never block the response
  db.update(creatorLinksTable)
    .set({ clickCount: sql`${creatorLinksTable.clickCount} + 1` })
    .where(eq(creatorLinksTable.id, id))
    .catch(() => undefined);

  res.json({ ok: true });
});

export default router;
