import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ListNotificationsQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};

  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit).offset(offset);

  const actorIds = notifications.filter(n => n.actorId).map(n => n.actorId!);
  const summaries = await getUserSummaries([...new Set(actorIds)]);

  res.json(notifications.map(n => ({
    ...n,
    actor: n.actorId ? summaries[n.actorId] ?? null : null,
  })));
});

router.post("/notifications/read", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  res.json({ count: Number(result?.count ?? 0) });
});

export default router;
