import { Router, type IRouter } from "express";
import { db, streamsTable, streamInvitesTable, streamPurchasesTable, walletsTable, transactionsTable, followsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc, sql, inArray, and, gte } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { CreateStreamBody, UpdateStreamBody, ListStreamsQueryParams, TipStreamBody } from "@workspace/api-zod";
import { getUserSummaries } from "../lib/helpers";
import { getTxFeeRate } from "../lib/fees";
import { createLimiter, walletLimiter } from "../middlewares/rateLimiter";
import { createMuxLiveStream, completeMuxLiveStream, deleteMuxLiveStream, deleteMuxAsset, RTMP_BASE_URL, mintMuxJwt, getMuxAssetPlaybackId } from "../lib/mux";
import { broadcastWatchPartyUrl } from "../lib/webrtc-signaling";
import { logIpEvent } from "../lib/ipEvents";
import { startLiveScan, stopLiveScan } from "../lib/liveScanner";

const router: IRouter = Router();

async function enrichStreams(streams: any[], viewerId?: number) {
  if (streams.length === 0) return [];
  const hostIds = [...new Set(streams.map(s => s.hostId))];
  const summaries = await getUserSummaries(hostIds, viewerId);
  return streams.map(({ muxStreamKey: _key, muxLiveStreamId: _lid, ...s }) => ({
    ...s,
    // Gate the recorded VOD: only expose muxAssetId when the recording has been
    // scanned and confirmed clean. Live real-time muxPlaybackId is unaffected.
    muxAssetId: s.scanStatus === 'clean' ? s.muxAssetId : null,
    host: summaries[s.hostId] ?? null,
    accessPrice: s.accessPrice ? Number(s.accessPrice) : null,
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  }));
}

router.get("/streams", optionalAuth, async (req, res) => {
  const parsed = ListStreamsQueryParams.safeParse(req.query);
  const { limit = 20, offset = 0 } = parsed.success ? parsed.data : {};
  const viewerId = (req as any).userId;

  const streams = await db.select().from(streamsTable)
    .where(eq(streamsTable.status, "live"))
    .orderBy(desc(streamsTable.viewerCount))
    .limit(limit).offset(offset);

  // Filter out private/invite-only streams from non-authed users
  const visible = streams.filter(s => {
    if (s.audienceType === "public") return true;
    if (!viewerId) return false;
    if (s.hostId === viewerId) return true;
    if (s.audienceType === "private" || s.audienceType === "invite_only") return false;
    return true; // girls_only / guys_only shown in list; enforced on join
  });

  res.json(await enrichStreams(visible, viewerId));
});

router.post("/streams", requireAuth, createLimiter, async (req, res) => {
  const parsed = CreateStreamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const hostId = (req as any).user.id;
  const { inviteUserIds, notifyFollowers, ...streamData } = parsed.data as any;

  const insertData = {
    ...streamData,
    hostId,
    status: "live" as const,
    accessPrice: streamData.accessPrice != null ? String(streamData.accessPrice) : undefined,
    audienceType: streamData.audienceType ?? "public",
    isPrivate: streamData.audienceType === "private" || streamData.audienceType === "invite_only",
  };
  let [stream] = await db.insert(streamsTable).values(insertData).returning();

  // Create Mux live stream for real RTMP ingest
  try {
    const muxCreds = await createMuxLiveStream();
    const [updated] = await db.update(streamsTable)
      .set({
        muxLiveStreamId: muxCreds.muxLiveStreamId,
        muxPlaybackId: muxCreds.muxPlaybackId,
        muxStreamKey: muxCreds.muxStreamKey,
      })
      .where(eq(streamsTable.id, stream.id))
      .returning();
    stream = updated;
  } catch (err) {
    req.log.error({ err }, "Failed to create Mux live stream — stream saved without Mux");
  }

  logIpEvent(hostId, req.ip, "stream_start");

  // Start background live CSAM sampler (fire-and-forget; no-op if Mux creds unavailable)
  if (stream.muxPlaybackId && stream.muxLiveStreamId) {
    startLiveScan(stream.id, stream.muxPlaybackId, stream.muxLiveStreamId);
  }

  // Insert invites if invite_only
  if (streamData.audienceType === "invite_only" && Array.isArray(inviteUserIds) && inviteUserIds.length > 0) {
    await db.insert(streamInvitesTable).values(
      inviteUserIds.map((uid: number) => ({ streamId: stream.id, invitedUserId: uid }))
    ).onConflictDoNothing();
  }

  // Notify followers
  if (notifyFollowers !== false) {
    const followers = await db.select({ followerId: followsTable.followerId })
      .from(followsTable).where(eq(followsTable.followingId, hostId));
    if (followers.length > 0) {
      const host = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, hostId)).limit(1);
      const displayName = host[0]?.displayName ?? "Someone";
      await db.insert(notificationsTable).values(
        followers.map(f => ({
          userId: f.followerId,
          type: "stream_live",
          message: `${displayName} just went live!`,
          actorId: hostId,
          relatedId: stream.id,
        }))
      );
    }
  }

  const [enriched] = await enrichStreams([stream], hostId);
  res.status(201).json(enriched);
});

router.get("/streams/:streamId", optionalAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  if (isNaN(streamId)) { res.status(400).json({ error: "Invalid streamId" }); return; }

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }

  const viewerId = (req as any).userId;

  // Audience gate
  if (stream.audienceType !== "public" && stream.hostId !== viewerId) {
    if (!viewerId) { res.status(403).json({ error: "Sign in to watch this stream" }); return; }

    if (stream.audienceType === "invite_only") {
      const invites = await db.select().from(streamInvitesTable)
        .where(eq(streamInvitesTable.streamId, streamId));
      const isInvited = invites.some(i => i.invitedUserId === viewerId);
      if (!isInvited) { res.status(403).json({ error: "This stream is invite-only" }); return; }
    }

    if (stream.audienceType === "private") {
      res.status(403).json({ error: "This stream is private" }); return;
    }

    if (stream.audienceType === "girls_only" || stream.audienceType === "guys_only") {
      const [viewer] = await db.select({ gender: usersTable.gender }).from(usersTable).where(eq(usersTable.id, viewerId)).limit(1);
      const required = stream.audienceType === "girls_only" ? "female" : "male";
      if (viewer?.gender !== required) {
        res.status(403).json({ error: `This stream is ${stream.audienceType === "girls_only" ? "girls" : "guys"} only` }); return;
      }
    }
  }

  // Payment gate — host always has access
  if (stream.isPaid && stream.accessPrice && stream.hostId !== viewerId) {
    if (!viewerId) {
      res.status(402).json({ error: "Sign in to purchase access to this stream", accessPrice: Number(stream.accessPrice), requiresPurchase: true });
      return;
    }
    const [purchase] = await db.select({ id: streamPurchasesTable.id })
      .from(streamPurchasesTable)
      .where(and(eq(streamPurchasesTable.streamId, streamId), eq(streamPurchasesTable.userId, viewerId)))
      .limit(1);
    if (!purchase) {
      res.status(402).json({ error: "Purchase required to watch this stream", accessPrice: Number(stream.accessPrice), requiresPurchase: true });
      return;
    }
  }

  const [enriched] = await enrichStreams([stream], viewerId);
  res.json(enriched);
});

// GET /streams/:streamId/playback-token
// Returns a short-lived RS256 signed Mux JWT for the live HLS or clean recording VOD.
// Runs the same audience + payment gates as GET /streams/:streamId before minting.
router.get("/streams/:streamId/playback-token", optionalAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  if (isNaN(streamId)) { res.status(400).json({ error: "Invalid streamId" }); return; }

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }

  const viewerId: number | undefined = (req as any).userId;

  // ── Audience gate (mirrors GET /streams/:streamId) ────────────────────────
  if (stream.audienceType !== "public" && stream.hostId !== viewerId) {
    if (!viewerId) { res.status(403).json({ error: "Sign in to watch this stream" }); return; }

    if (stream.audienceType === "invite_only") {
      const invites = await db.select().from(streamInvitesTable)
        .where(eq(streamInvitesTable.streamId, streamId));
      if (!invites.some(i => i.invitedUserId === viewerId)) {
        res.status(403).json({ error: "This stream is invite-only" }); return;
      }
    }
    if (stream.audienceType === "private") {
      res.status(403).json({ error: "This stream is private" }); return;
    }
    if (stream.audienceType === "girls_only" || stream.audienceType === "guys_only") {
      const [viewer] = await db.select({ gender: usersTable.gender })
        .from(usersTable).where(eq(usersTable.id, viewerId)).limit(1);
      const required = stream.audienceType === "girls_only" ? "female" : "male";
      if (viewer?.gender !== required) {
        res.status(403).json({ error: `This stream is ${stream.audienceType === "girls_only" ? "girls" : "guys"} only` }); return;
      }
    }
  }

  // ── Payment gate ──────────────────────────────────────────────────────────
  if (stream.isPaid && stream.accessPrice && stream.hostId !== viewerId) {
    if (!viewerId) {
      res.status(402).json({ error: "Purchase required", requiresPurchase: true }); return;
    }
    const [purchase] = await db.select({ id: streamPurchasesTable.id })
      .from(streamPurchasesTable)
      .where(and(eq(streamPurchasesTable.streamId, streamId), eq(streamPurchasesTable.userId, viewerId)))
      .limit(1);
    if (!purchase) {
      res.status(402).json({ error: "Purchase required", requiresPurchase: true }); return;
    }
  }

  // ── Mint token ────────────────────────────────────────────────────────────
  try {
    if (stream.status === "live") {
      // Live stream — short-lived token; client refreshes before expiry so the gate
      // re-runs each window (env LIVE_PLAYBACK_TOKEN_TTL_SEC, default 300 s / 5 min).
      if (!stream.muxPlaybackId) {
        res.status(404).json({ error: "No live playback available yet" }); return;
      }
      const liveTtl = Math.max(60, parseInt(process.env.LIVE_PLAYBACK_TOKEN_TTL_SEC ?? "300", 10));
      const token = mintMuxJwt(stream.muxPlaybackId, "v", liveTtl);
      res.json({ token, playbackId: stream.muxPlaybackId, ttlSeconds: liveTtl });
    } else {
      // Recording VOD — only served after CSAM scan confirms clean
      if (stream.scanStatus !== "clean") {
        res.status(403).json({ error: "Recording not available — pending content review" }); return;
      }
      if (!stream.muxAssetId) {
        res.status(404).json({ error: "No recording available for this stream" }); return;
      }
      // Retrieve the recording asset's playback ID from Mux (separate from the live playback ID)
      // VOD token: env VOD_PLAYBACK_TOKEN_TTL_SEC, default 1200 s / 20 min.
      const playbackId = await getMuxAssetPlaybackId(stream.muxAssetId);
      const vodTtl = Math.max(60, parseInt(process.env.VOD_PLAYBACK_TOKEN_TTL_SEC ?? "1200", 10));
      const token = mintMuxJwt(playbackId, "v", vodTtl);
      res.json({ token, playbackId, ttlSeconds: vodTtl });
    }
  } catch (err: unknown) {
    req.log.error({ err, streamId }, "Failed to mint playback token");
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("MUX_SIGNING_KEY_ID")) {
      res.status(503).json({ error: "Playback token service not configured" }); return;
    }
    res.status(500).json({ error: "Failed to generate playback token" });
  }
});

router.post("/streams/:streamId/purchase", requireAuth, walletLimiter, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const buyerId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }
  if (!stream.isPaid || !stream.accessPrice) { res.status(400).json({ error: "This stream is not a paid stream" }); return; }
  if (stream.hostId === buyerId) { res.status(400).json({ error: "Cannot purchase your own stream" }); return; }

  const amount = Number(stream.accessPrice);
  const hostId = stream.hostId;
  const [streamHost] = await db.select({ accountTier: usersTable.accountTier })
    .from(usersTable).where(eq(usersTable.id, hostId)).limit(1);
  const feeRate = getTxFeeRate(streamHost?.accountTier);
  const fee = Number((amount * feeRate).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  try {
    await db.transaction(async (trx) => {
      const [buyerWallet] = await trx
        .select({ balance: walletsTable.balance })
        .from(walletsTable)
        .where(eq(walletsTable.userId, buyerId))
        .limit(1);
      if (!buyerWallet || Number(buyerWallet.balance) < amount) {
        throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT" });
      }
      const [deducted] = await trx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} - ${amount}`, totalSpent: sql`${walletsTable.totalSpent} + ${amount}` })
        .where(and(eq(walletsTable.userId, buyerId), gte(walletsTable.balance, amount.toFixed(2))))
        .returning({ balance: walletsTable.balance });
      if (!deducted) throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT" });
      await trx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} + ${netAmount}`, totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}` })
        .where(eq(walletsTable.userId, hostId));
      await trx.insert(transactionsTable).values({
        userId: buyerId,
        type: "purchase",
        amount: String(amount),
        fee: String(fee),
        status: "completed",
        description: `Stream access: ${stream.title}`,
        relatedUserId: hostId,
      });
      await trx.insert(streamPurchasesTable).values({
        streamId,
        userId: buyerId,
        amount: String(amount),
      });
    });
  } catch (err: any) {
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient balance — add funds to your wallet to purchase this stream." });
      return;
    }
    // Unique constraint violation: concurrent request already completed the purchase
    // The debit was rolled back by the transaction — buyer is NOT charged twice
    if (err.code === "23505") {
      res.json({ ok: true }); return;
    }
    throw err;
  }

  req.log.info({ streamId, buyerId, amount }, "Stream purchase completed");
  res.json({ ok: true });
});

router.patch("/streams/:streamId", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const userId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateStreamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (updateData.status === "ended") {
    stopLiveScan(streamId);
    updateData.endedAt = new Date();
    if (stream.muxLiveStreamId) {
      completeMuxLiveStream(stream.muxLiveStreamId);
    }
  }

  const [updated] = await db.update(streamsTable).set(updateData).where(eq(streamsTable.id, streamId)).returning();

  if ("watchPartyUrl" in parsed.data) {
    const rawUrl = parsed.data.watchPartyUrl;
    const effectiveUrl = (rawUrl && rawUrl.trim()) ? rawUrl.trim() : null;
    broadcastWatchPartyUrl(streamId, effectiveUrl);
  }

  const [enriched] = await enrichStreams([updated], userId);
  res.json(enriched);
});

router.delete("/streams/:streamId", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const userId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Legal-preservation guard: a recording flagged for NCMEC or blocked by CSAM
  // must not be destroyable by the host — it requires admin action to resolve.
  if (stream.scanStatus === "blocked" || stream.needsNcmecReport) {
    res.status(403).json({ error: "This recording is under mandatory review and cannot be deleted. Contact support." });
    return;
  }

  stopLiveScan(streamId);
  await db.update(streamsTable).set({ status: "ended", endedAt: new Date() }).where(eq(streamsTable.id, streamId));
  if (stream.muxLiveStreamId) {
    await deleteMuxLiveStream(stream.muxLiveStreamId);
  }
  if (stream.muxAssetId) {
    await deleteMuxAsset(stream.muxAssetId);
  }
  res.json({ ok: true });
});

// ── STREAM CREDENTIALS (host only) ─────────────────────────────────────────

router.get("/streams/:streamId/stream-credentials", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const userId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!stream.muxStreamKey || !stream.muxPlaybackId) {
    res.status(404).json({ error: "No Mux credentials available for this stream" }); return;
  }

  res.json({
    rtmpUrl: RTMP_BASE_URL,
    streamKey: stream.muxStreamKey,
    muxPlaybackId: stream.muxPlaybackId,
  });
});

// ── INVITE MANAGEMENT ──────────────────────────────────────────────────────

router.post("/streams/:streamId/invites", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const userId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) { res.status(400).json({ error: "userIds required" }); return; }

  await db.insert(streamInvitesTable).values(
    userIds.map((uid: number) => ({ streamId, invitedUserId: uid }))
  ).onConflictDoNothing();

  res.json({ ok: true });
});

router.delete("/streams/:streamId/invites/:invitedUserId", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const invitedUserId = parseInt(req.params.invitedUserId as string);
  const userId = (req as any).user.id;

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(streamInvitesTable)
    .where(and(
      eq(streamInvitesTable.streamId, streamId),
      eq(streamInvitesTable.invitedUserId, invitedUserId),
    ));

  res.json({ ok: true });
});

router.post("/streams/:streamId/tip", requireAuth, walletLimiter, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const senderId = (req as any).user.id;

  const parsed = TipStreamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [stream] = await db.select().from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Stream not found" }); return; }

  // Recipient is always the stream host — never trust request body for this
  const hostId = stream.hostId;
  if (hostId === senderId) { res.status(400).json({ error: "Cannot tip your own stream" }); return; }

  const { amount, message } = parsed.data;
  const [streamHost] = await db.select({ accountTier: usersTable.accountTier })
    .from(usersTable).where(eq(usersTable.id, hostId)).limit(1);
  const feeRate = getTxFeeRate(streamHost?.accountTier);
  const fee = Number((amount * feeRate).toFixed(2));
  const netAmount = Number((amount - fee).toFixed(2));

  let txResult: typeof transactionsTable.$inferSelect | undefined;
  try {
    await db.transaction(async (trx) => {
      const [senderWallet] = await trx
        .select({ balance: walletsTable.balance })
        .from(walletsTable)
        .where(eq(walletsTable.userId, senderId))
        .limit(1);
      if (!senderWallet || Number(senderWallet.balance) < amount) {
        throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT" });
      }
      // Atomic deduct — WHERE balance >= amount prevents double-spend under concurrent requests
      const [deducted] = await trx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} - ${amount}`, totalSpent: sql`${walletsTable.totalSpent} + ${amount}` })
        .where(and(eq(walletsTable.userId, senderId), gte(walletsTable.balance, amount.toFixed(2))))
        .returning({ balance: walletsTable.balance });
      if (!deducted) throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT" });
      await trx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} + ${netAmount}`, totalEarned: sql`${walletsTable.totalEarned} + ${netAmount}` })
        .where(eq(walletsTable.userId, hostId));
      const [inserted] = await trx.insert(transactionsTable).values({
        userId: senderId,
        type: "tip",
        amount: String(amount),
        fee: String(fee),
        status: "completed",
        description: message ?? `Tip to streamer`,
        relatedUserId: hostId,
      }).returning();
      txResult = inserted;
    });
  } catch (err: any) {
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    throw err;
  }
  res.json({ ...txResult!, amount: Number(txResult!.amount), fee: Number(txResult!.fee), relatedUser: null });
});

// ── HEARTBEAT (host keeps stream alive) ────────────────────────────────────
router.post("/streams/:streamId/heartbeat", requireAuth, async (req, res) => {
  const streamId = parseInt(req.params.streamId as string);
  const userId = (req as any).user.id;
  const [stream] = await db.select({ id: streamsTable.id, hostId: streamsTable.hostId, status: streamsTable.status })
    .from(streamsTable).where(eq(streamsTable.id, streamId)).limit(1);
  if (!stream) { res.status(404).json({ error: "Not found" }); return; }
  if (stream.hostId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (stream.status !== "live") { res.status(400).json({ error: "Stream not live" }); return; }
  await db.update(streamsTable).set({ lastHeartbeatAt: new Date() }).where(eq(streamsTable.id, streamId));
  res.json({ ok: true });
});

export { cleanupStaleStreams };

async function cleanupStaleStreams() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 min with no heartbeat
  const stale = await db.select({ id: streamsTable.id, muxLiveStreamId: streamsTable.muxLiveStreamId })
    .from(streamsTable)
    .where(
      and(
        eq(streamsTable.status, "live"),
        sql`(${streamsTable.lastHeartbeatAt} IS NULL AND ${streamsTable.createdAt} < ${cutoff}) OR (${streamsTable.lastHeartbeatAt} < ${cutoff})`
      )
    );
  for (const s of stale) {
    stopLiveScan(s.id);
    await db.update(streamsTable).set({ status: "ended", endedAt: new Date() }).where(eq(streamsTable.id, s.id));
    if (s.muxLiveStreamId) {
      completeMuxLiveStream(s.muxLiveStreamId).catch(() => {});
    }
  }
  return stale.length;
}

export default router;
