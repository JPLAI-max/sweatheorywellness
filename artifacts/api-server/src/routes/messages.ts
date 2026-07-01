import { Router, type IRouter, type Request, type Response } from "express";
import { scanAsset } from "../lib/csam";
import { db, conversationsTable, conversationParticipantsTable, messagesTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and, sql, inArray, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { SendMessageBody, GetMessagesQueryParams } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";
import { sendNewMessageEmail } from "../lib/email";
import { serveMediaUrl, isValidR2MediaUrl } from "../lib/r2";

const router: IRouter = Router();

// SSE connection registry: userId → set of response objects
const sseClients = new Map<number, Set<Response>>();

function pushSseEvent(userId: number, event: string, data: unknown) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* ignore broken pipes */ }
  }
}

// GET /conversations/unread-count — must be before /:conversationId routes
router.get("/conversations/unread-count", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const myConvs = await db
    .select({ conversationId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, userId));

  const convIds = myConvs.map(c => c.conversationId);
  if (convIds.length === 0) { res.json({ count: 0 }); return; }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messagesTable)
    .where(
      and(
        inArray(messagesTable.conversationId, convIds),
        eq(messagesTable.isRead, false),
        ne(messagesTable.senderId, userId)
      )
    );

  res.json({ count: Number(row?.count ?? 0) });
});

// GET /conversations/events — SSE for real-time messages
router.get("/conversations/events", requireAuth, (req, res) => {
  const userId = (req as any).user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send a heartbeat immediately so the client knows it connected
  res.write(`event: connected\ndata: {}\n\n`);

  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);

  // Heartbeat every 20s to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(`:ping\n\n`); } catch { clearInterval(heartbeat); }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
});

// GET /conversations
router.get("/conversations", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const myConvs = await db
    .select({ conversationId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, userId));

  const convIds = myConvs.map(c => c.conversationId);
  if (convIds.length === 0) { res.json([]); return; }

  const result = [];
  for (const convId of convIds) {
    const participants = await db
      .select()
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, convId));
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, convId))
      .limit(1);
    const [lastMsg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, convId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    const [unread] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, convId),
          eq(messagesTable.isRead, false),
          ne(messagesTable.senderId, userId)
        )
      );

    const summaries = await getUserSummaries(participants.map(p => p.userId), userId);
    result.push({
      id: conv.id,
      participants: participants.map(p => summaries[p.userId]).filter(Boolean),
      lastMessage: lastMsg
        ? { content: lastMsg.content, sentAt: lastMsg.createdAt, senderId: lastMsg.senderId }
        : null,
      unreadCount: Number(unread?.count ?? 0),
      createdAt: conv.createdAt,
    });
  }

  // Sort: conversations with most recent messages first
  result.sort((a, b) => {
    const aTime = a.lastMessage ? new Date(a.lastMessage.sentAt).getTime() : new Date(a.createdAt).getTime();
    const bTime = b.lastMessage ? new Date(b.lastMessage.sentAt).getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  res.json(result);
});

// POST /conversations
router.post("/conversations", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { participantId } = req.body;

  if (!participantId) { res.status(400).json({ error: "participantId required" }); return; }

  // Check if conversation already exists
  const myConvs = await db
    .select({ convId: conversationParticipantsTable.conversationId })
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, userId));

  for (const { convId } of myConvs) {
    const other = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, participantId)
        )
      );
    if (other.length > 0) {
      const [conv] = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, convId))
        .limit(1);
      const summaries = await getUserSummaries([userId, participantId]);
      res.json({
        id: conv.id,
        participants: [summaries[userId], summaries[participantId]].filter(Boolean),
        lastMessage: null,
        unreadCount: 0,
        createdAt: conv.createdAt,
      });
      return;
    }
  }

  const [conv] = await db.insert(conversationsTable).values({}).returning();
  await db.insert(conversationParticipantsTable).values([
    { conversationId: conv.id, userId },
    { conversationId: conv.id, userId: participantId },
  ]);

  const summaries = await getUserSummaries([userId, participantId]);
  res.json({
    id: conv.id,
    participants: [summaries[userId], summaries[participantId]].filter(Boolean),
    lastMessage: null,
    unreadCount: 0,
    createdAt: conv.createdAt,
  });
});

// GET /conversations/:conversationId/messages
router.get("/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  const conversationId = parseInt(req.params.conversationId as string);
  const parsed = GetMessagesQueryParams.safeParse(req.query);
  const { limit = 50 } = parsed.success ? parsed.data : {};
  const userId = (req as any).user.id;

  const [participant] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, userId)
      )
    )
    .limit(1);
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);

  // Mark only messages from OTHERS as read
  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        ne(messagesTable.senderId, userId),
        eq(messagesTable.isRead, false)
      )
    );

  const summaries = await getUserSummaries([...new Set(msgs.map(m => m.senderId))], userId);
  const enrichedMsgs = await Promise.all(msgs.reverse().map(async m => ({
    ...m,
    // Fail-closed: hide media until scan_status='clean'
    mediaUrl: m.scanStatus === 'clean' ? await serveMediaUrl(m.mediaUrl) : null,
    sender: summaries[m.senderId] ?? null,
  })));
  res.json(enrichedMsgs);
});

// POST /conversations/:conversationId/messages
router.post("/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  const conversationId = parseInt(req.params.conversationId as string);
  const senderId = (req as any).user.id;

  const [participant] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, senderId)
      )
    )
    .limit(1);
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.mediaUrl && !isValidR2MediaUrl(parsed.data.mediaUrl)) { res.status(400).json({ error: "mediaUrl must point to a valid R2 media object" }); return; }

  const msgHasMedia = !!parsed.data.mediaUrl;
  const [msg] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      senderId,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl,
      scanStatus: msgHasMedia ? 'pending' : 'clean',
    })
    .returning();

  if (msgHasMedia) {
    void scanAsset(msg.id, 'dm_message');
  }

  const summaries = await getUserSummaries([senderId]);
  const sender = summaries[senderId];

  const responseMsg = {
    ...msg,
    mediaUrl: msg.scanStatus === 'clean' ? await serveMediaUrl(msg.mediaUrl) : null,
    sender: sender ?? null,
  };

  // Get other participants
  const otherParticipants = (
    await db
      .select({ userId: conversationParticipantsTable.userId })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, conversationId))
  )
    .map(p => p.userId)
    .filter(id => id !== senderId);

  if (sender && otherParticipants.length > 0) {
    // In-app notifications
    await db.insert(notificationsTable).values(
      otherParticipants.map(recipientId => ({
        userId: recipientId,
        type: "new_message",
        message: `${sender.displayName ?? sender.username} sent you a message`,
        actorId: senderId,
        relatedId: conversationId,
        isRead: false,
      }))
    );

    // Push SSE event to online recipients
    for (const recipientId of otherParticipants) {
      pushSseEvent(recipientId, "new_message", responseMsg);
    }

    // Email notification (fire-and-forget)
    const recipients = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, otherParticipants));
    for (const r of recipients) {
      sendNewMessageEmail(
        r.email,
        sender.displayName ?? sender.username,
        sender.username,
        conversationId
      );
    }
  }

  res.status(201).json(responseMsg);
});

// PATCH /conversations/:conversationId/read
router.patch("/conversations/:conversationId/read", requireAuth, async (req, res) => {
  const conversationId = parseInt(req.params.conversationId as string);
  const userId = (req as any).user.id;

  const [participant] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(
      and(
        eq(conversationParticipantsTable.conversationId, conversationId),
        eq(conversationParticipantsTable.userId, userId)
      )
    )
    .limit(1);
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  await db
    .update(messagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        ne(messagesTable.senderId, userId),
        eq(messagesTable.isRead, false)
      )
    );

  res.json({ ok: true });
});

export default router;
