import { Router, type IRouter } from "express";
import { db, meetupsTable, meetupRsvpsTable, personalsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { getUserSummaries } from "../lib/helpers";
import { z } from "zod";

const router: IRouter = Router();

const CreateMeetupBody = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  date: z.string(),
  location: z.string().optional(),
  virtualUrl: z.string().optional(),
  isVirtual: z.boolean().default(false),
  category: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  coverImageUrl: z.string().optional(),
});

const UpdateMeetupBody = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  virtualUrl: z.string().optional(),
  status: z.enum(["upcoming", "cancelled", "past"]).optional(),
  coverImageUrl: z.string().optional(),
});

async function enrichMeetups(meetups: any[], viewerId?: number) {
  if (meetups.length === 0) return [];
  const hostIds = [...new Set(meetups.map(m => m.hostId))];
  const summaries = await getUserSummaries(hostIds, viewerId);

  let rsvpedIds = new Set<number>();
  if (viewerId) {
    const rsvps = await db.select({ meetupId: meetupRsvpsTable.meetupId })
      .from(meetupRsvpsTable)
      .where(eq(meetupRsvpsTable.userId, viewerId));
    rsvpedIds = new Set(rsvps.map(r => r.meetupId));
  }

  return meetups.map(m => ({
    ...m,
    date: m.date instanceof Date ? m.date.toISOString() : m.date,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    host: summaries[m.hostId] ?? null,
    hasRsvped: rsvpedIds.has(m.id),
  }));
}

router.get("/meetups", optionalAuth, async (req, res) => {
  const viewerId = (req as any).userId;
  const { category, type, limit = 20, offset = 0 } = req.query as any;

  let query = db.select().from(meetupsTable).$dynamic();
  const conditions = [];

  if (category) conditions.push(eq(meetupsTable.category, category as string));
  if (type === "virtual") conditions.push(eq(meetupsTable.isVirtual, true));
  if (type === "in-person") conditions.push(eq(meetupsTable.isVirtual, false));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const meetups = await query
    .orderBy(desc(meetupsTable.date))
    .limit(Number(limit))
    .offset(Number(offset));

  const total = await db.select({ count: sql<number>`count(*)` }).from(meetupsTable);
  res.json({ meetups: await enrichMeetups(meetups, viewerId), total: Number(total[0].count) });
});

router.post("/meetups", requireAuth, async (req, res) => {
  const parsed = CreateMeetupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const hostId = (req as any).user.id;
  const [meetup] = await db.insert(meetupsTable).values({
    ...parsed.data,
    hostId,
    date: new Date(parsed.data.date),
  }).returning();

  const [enriched] = await enrichMeetups([meetup], hostId);
  res.status(201).json(enriched);
});

router.get("/meetups/:meetupId", optionalAuth, async (req, res) => {
  const meetupId = parseInt(req.params.meetupId as string);
  if (isNaN(meetupId)) { res.status(400).json({ error: "Invalid meetupId" }); return; }

  const [meetup] = await db.select().from(meetupsTable).where(eq(meetupsTable.id, meetupId)).limit(1);
  if (!meetup) { res.status(404).json({ error: "Meetup not found" }); return; }

  const viewerId = (req as any).userId;
  const [enriched] = await enrichMeetups([meetup], viewerId);
  res.json(enriched);
});

router.patch("/meetups/:meetupId", requireAuth, async (req, res) => {
  const meetupId = parseInt(req.params.meetupId as string);
  const userId = (req as any).user.id;

  const [meetup] = await db.select().from(meetupsTable).where(eq(meetupsTable.id, meetupId)).limit(1);
  if (!meetup) { res.status(404).json({ error: "Not found" }); return; }
  if (meetup.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateMeetupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (updateData.date) updateData.date = new Date(updateData.date);

  const [updated] = await db.update(meetupsTable).set(updateData).where(eq(meetupsTable.id, meetupId)).returning();
  const [enriched] = await enrichMeetups([updated], userId);
  res.json(enriched);
});

router.post("/meetups/:meetupId/rsvp", requireAuth, async (req, res) => {
  const meetupId = parseInt(req.params.meetupId as string);
  const userId = (req as any).user.id;

  const [meetup] = await db.select().from(meetupsTable).where(eq(meetupsTable.id, meetupId)).limit(1);
  if (!meetup) { res.status(404).json({ error: "Not found" }); return; }
  if (meetup.status === "cancelled") { res.status(400).json({ error: "Meetup is cancelled" }); return; }
  if (meetup.maxAttendees && meetup.rsvpCount >= meetup.maxAttendees) {
    res.status(400).json({ error: "Meetup is full" }); return;
  }

  const existing = await db.select().from(meetupRsvpsTable)
    .where(and(eq(meetupRsvpsTable.meetupId, meetupId), eq(meetupRsvpsTable.userId, userId)))
    .limit(1);
  if (existing.length > 0) { res.status(400).json({ error: "Already RSVPed" }); return; }

  await db.insert(meetupRsvpsTable).values({ meetupId, userId });
  const [updated] = await db.update(meetupsTable)
    .set({ rsvpCount: sql`${meetupsTable.rsvpCount} + 1` })
    .where(eq(meetupsTable.id, meetupId))
    .returning();

  res.json({ rsvpCount: updated.rsvpCount, hasRsvped: true });
});

router.delete("/meetups/:meetupId/rsvp", requireAuth, async (req, res) => {
  const meetupId = parseInt(req.params.meetupId as string);
  const userId = (req as any).user.id;

  await db.delete(meetupRsvpsTable)
    .where(and(eq(meetupRsvpsTable.meetupId, meetupId), eq(meetupRsvpsTable.userId, userId)));

  const [updated] = await db.update(meetupsTable)
    .set({ rsvpCount: sql`GREATEST(${meetupsTable.rsvpCount} - 1, 0)` })
    .where(eq(meetupsTable.id, meetupId))
    .returning();

  res.json({ rsvpCount: updated.rsvpCount, hasRsvped: false });
});

const CreatePersonalBody = z.object({
  headline: z.string().min(3).max(120),
  description: z.string().min(10).max(1000),
  age: z.number().int().min(18).max(99).optional(),
  gender: z.string().optional(),
  lookingFor: z.array(z.string()).default([]),
  location: z.string().optional(),
  photoUrl: z.string().optional(),
});

router.get("/meetups/personals", optionalAuth, async (req, res) => {
  const viewerId = (req as any).userId;
  const { limit = 50, offset = 0, lookingFor } = req.query as any;

  let rows = await db
    .select()
    .from(personalsTable)
    .where(eq(personalsTable.active, true))
    .orderBy(desc(personalsTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  if (lookingFor) {
    rows = rows.filter(r => (r.lookingFor as string[]).includes(lookingFor));
  }

  const userIds = [...new Set(rows.map(r => r.userId))];
  const summaries = await getUserSummaries(userIds, viewerId);

  const result = rows.map(r => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    author: summaries[r.userId] ?? null,
    isOwn: viewerId === r.userId,
  }));

  res.json({ personals: result, total: result.length });
});

router.post("/meetups/personals", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const parsed = CreatePersonalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select({ id: personalsTable.id })
    .from(personalsTable)
    .where(and(eq(personalsTable.userId, userId), eq(personalsTable.active, true)))
    .limit(1);

  let personal;
  if (existing.length > 0) {
    [personal] = await db.update(personalsTable)
      .set({ ...parsed.data, createdAt: new Date() })
      .where(eq(personalsTable.id, existing[0].id))
      .returning();
  } else {
    [personal] = await db.insert(personalsTable)
      .values({ ...parsed.data, userId })
      .returning();
  }

  const summaries = await getUserSummaries([userId], userId);
  res.status(201).json({
    ...personal,
    createdAt: personal.createdAt instanceof Date ? personal.createdAt.toISOString() : personal.createdAt,
    author: summaries[userId] ?? null,
    isOwn: true,
  });
});

router.delete("/meetups/personals/:personalId", requireAuth, async (req, res) => {
  const personalId = parseInt(req.params.personalId as string);
  const userId = (req as any).user.id;
  if (isNaN(personalId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(personalsTable).where(eq(personalsTable.id, personalId)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(personalsTable).set({ active: false }).where(eq(personalsTable.id, personalId));
  res.json({ ok: true });
});

export default router;
