import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, bugReportsTable } from "@workspace/db";
import { optionalAuth } from "../middlewares/auth";
import { sendBugReportEmail } from "../lib/email";

const router: IRouter = Router();

const SubmitBugReportBody = z.object({
  issueType: z.enum(["bug", "content_report", "account_issue", "other"]),
  description: z.string().min(10).max(5000),
  contactEmail: z.string().email(),
});

// POST /bug-reports — submit a bug / issue report
router.post("/bug-reports", optionalAuth, async (req, res) => {
  const userId: number | undefined = (req as any).userId;
  const parsed = SubmitBugReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const { issueType, description, contactEmail } = parsed.data;

  const [report] = await db.insert(bugReportsTable).values({
    userId: userId ?? null,
    issueType,
    description,
    contactEmail,
    status: "pending",
  }).returning();

  sendBugReportEmail({ reportId: report.id, issueType, description, contactEmail, userId });

  res.status(201).json({ ok: true, reportId: report.id });
});

export default router;
