import { Router, type IRouter } from "express";
import { db, reportsTable, streamsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, count, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { tightenSamplerInterval } from "../lib/liveScanner";
import { notifyAdminsOfReport } from "../lib/csam";

const REPORTS_PER_HOUR = Math.max(1, parseInt(process.env.REPORTS_PER_USER_PER_HOUR ?? "10", 10));

/** Interval (ms) to switch to for a live stream that received an underage_csam report. */
const CSAM_REPORTED_INTERVAL_MS = Math.max(
  1000,
  parseInt(process.env.CSAM_LIVE_REPORTED_INTERVAL_SEC ?? "3", 10) * 1000,
);

const SubmitReportBody = z.object({
  contentType: z.enum(["live_stream", "post", "user", "dm"]),
  contentId: z.string().min(1).max(255),
  reason: z.enum(["underage_csam", "non_consensual", "violence", "harassment", "spam", "other"]),
  note: z.string().max(1000).optional(),
});

const router: IRouter = Router();

// POST /reports — submit a content report (authenticated users only)
router.post("/reports", requireAuth, async (req, res) => {
  const reporterId = (req as any).user?.id as number;

  const parsed = SubmitReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { contentType, contentId, reason, note } = parsed.data;

  // Rate limit: max REPORTS_PER_HOUR reports per user in any rolling 60-minute window
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ recentCount }] = await db
    .select({ recentCount: count() })
    .from(reportsTable)
    .where(and(
      eq(reportsTable.reporterId, reporterId),
      gte(reportsTable.createdAt, oneHourAgo),
    ));

  if (Number(recentCount) >= REPORTS_PER_HOUR) {
    res.status(429).json({ error: "Report rate limit exceeded. Please try again later." });
    return;
  }

  // Dedup: one open report per (reporter, contentType, contentId)
  const [existing] = await db
    .select({ id: reportsTable.id })
    .from(reportsTable)
    .where(and(
      eq(reportsTable.reporterId, reporterId),
      eq(reportsTable.contentType, contentType),
      eq(reportsTable.contentId, contentId),
      eq(reportsTable.status, "open"),
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "You already have an open report for this content." });
    return;
  }

  // Insert the report
  const [report] = await db.insert(reportsTable).values({
    reporterId,
    contentType,
    contentId,
    reason,
    note: note ?? null,
    status: "open",
  }).returning();

  // underage_csam → immediate admin alert + tighten live scanner if applicable
  if (reason === "underage_csam") {
    notifyAdminsOfReport(report.id, reason, contentType, contentId).catch(() => {});

    if (contentType === "live_stream") {
      const streamId = parseInt(contentId, 10);
      if (!isNaN(streamId)) {
        // Only tighten if the stream is actually live
        const [liveStream] = await db
          .select({ id: streamsTable.id })
          .from(streamsTable)
          .where(and(eq(streamsTable.id, streamId), eq(streamsTable.status, "live")))
          .limit(1);

        if (liveStream) {
          tightenSamplerInterval(streamId, CSAM_REPORTED_INTERVAL_MS);
        }
      }
    }
  }

  res.status(201).json({ ok: true, id: report.id });
});

export default router;
