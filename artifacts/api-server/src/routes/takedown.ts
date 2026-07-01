import { Router, type IRouter } from "express";
import { db, takedownRequestsTable, postsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { sendTakedownNotificationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SubmitTakedownBody = z.object({
  requesterName: z.string().min(2).max(200),
  requesterEmail: z.string().email(),
  signature: z.string().min(2).max(200),
  relationship: z.enum(["self", "authorized_rep"]),
  contentUrl: z.string().min(1).max(2000),
  postId: z.number().int().positive().optional(),
  statement: z.string().min(10).max(5000),
  attestation: z.literal(true),
});

router.post("/takedown", async (req, res) => {
  const parsed = SubmitTakedownBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { attestation: _a, ...fields } = parsed.data;

  // Resolve postId from URL if not given explicitly
  let postId = fields.postId ?? null;
  if (!postId && fields.contentUrl) {
    const match = fields.contentUrl.match(/\/post\/(\d+)/);
    if (match) postId = parseInt(match[1]);
  }

  // Validate postId if provided
  if (postId) {
    const [post] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post) postId = null;
  }

  const [request] = await db.insert(takedownRequestsTable).values({
    ...fields,
    postId: postId ?? undefined,
    status: "pending",
  }).returning();

  sendTakedownNotificationEmail({
    requestId: request.id,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    relationship: request.relationship,
    contentUrl: request.contentUrl,
    statement: request.statement,
  });

  logger.info({ requestId: request.id }, "Takedown request submitted");
  res.status(201).json({ id: request.id, status: "pending" });
});

export default router;
