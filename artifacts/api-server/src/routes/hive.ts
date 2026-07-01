import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  ipEventsTable,
  preservationHoldsTable,
  consentRecordsTable,
  performerRecordsTable,
  ncmecReportsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

// ── Shared secret gate ────────────────────────────────────────────────────────
// Accepts HIVE_WEBHOOK_SECRET via request headers only:
//   Authorization: Bearer <secret>  |  Authorization: <secret>
//   X-Hive-Signature: <secret>
// Query-string transport is intentionally NOT supported — secrets in query params
// are logged by proxies, load balancers, and access logs. Header-only is required.
// Mismatch/absent → 401 with no body. Logs only metadata — never PII.

function checkHiveSecret(req: Request, res: Response): boolean {
  const secret = process.env.HIVE_WEBHOOK_SECRET;
  if (!secret) {
    req.log.warn("HIVE_WEBHOOK_SECRET not configured — rejecting Hive request");
    res.status(401).end();
    return false;
  }

  const authHeader = req.headers.authorization as string | undefined;
  const sigHeader = req.headers["x-hive-signature"] as string | undefined;

  let provided: string | undefined;
  if (authHeader) {
    provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  } else if (sigHeader) {
    provided = sigHeader.trim();
  }

  if (!provided || provided !== secret) {
    req.log.warn(
      { hasAuth: !!authHeader, hasSig: !!sigHeader },
      "Hive secret check failed",
    );
    res.status(401).end();
    return false;
  }

  return true;
}

// ── POST /hive/enrich ─────────────────────────────────────────────────────────
// Hive calls this to collect enrichment data before filing a CyberTipline report.
// READ-ONLY on our data — no writes except the access log embedded in pino.

router.post("/hive/enrich", async (req, res) => {
  if (!checkHiveSecret(req, res)) return;

  const { user_id, post_id } = req.body as {
    user_id?: number;
    post_id?: number;
    reporter_id?: unknown;
  };

  if (!user_id) {
    res.status(400).json({ error: "user_id required" });
    return;
  }

  // Fetch everything in parallel — fail fast if user missing
  const [userRows, performerRows, ipEvents, consentRows] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, user_id)).limit(1),
    db
      .select()
      .from(performerRecordsTable)
      .where(eq(performerRecordsTable.userId, user_id))
      .limit(1),
    db
      .select()
      .from(ipEventsTable)
      .where(eq(ipEventsTable.userId, user_id))
      .orderBy(desc(ipEventsTable.createdAt))
      .limit(50),
    post_id
      ? db
          .select({
            ipAddress: consentRecordsTable.ipAddress,
            createdAt: consentRecordsTable.createdAt,
          })
          .from(consentRecordsTable)
          .where(eq(consentRecordsTable.postId, post_id))
          .limit(1)
      : ([] as { ipAddress: string | null; createdAt: Date }[]),
  ]);

  const user = userRows[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const performer = performerRows[0] ?? null;

  // ── personOrUserReportedPerson ──────────────────────────────────────────────
  const isSyntheticEmail = user.email.endsWith("@oauth.sweatheory.com");
  const personEntry: Record<string, unknown> = {
    espIdentifier: String(user.id),
  };
  if (!isSyntheticEmail) {
    personEntry.email = user.email;
  }
  if (performer) {
    const nameParts = performer.legalName.trim().split(/\s+/);
    personEntry.firstName = nameParts[0];
    if (nameParts.length > 1) personEntry.lastName = nameParts.slice(1).join(" ");
    personEntry.dateOfBirth = performer.dateOfBirth; // YYYY-MM-DD
    // Compute age from DOB
    const dob = new Date(performer.dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    personEntry.age = age;
  }

  // ── ipCaptureEvent ─────────────────────────────────────────────────────────
  // Consent record IP for this specific post comes first (highest signal)
  const ipCaptureEvents: Array<{ eventName: string; ipAddress: string; dateTime: string }> = [];
  const consentRow = consentRows[0];
  if (post_id && consentRow?.ipAddress) {
    ipCaptureEvents.push({
      eventName: "post_create",
      ipAddress: consentRow.ipAddress,
      dateTime: consentRow.createdAt.toISOString(),
    });
  }
  for (const ev of ipEvents) {
    ipCaptureEvents.push({
      eventName: ev.eventName,
      ipAddress: ev.ipAddress,
      dateTime: ev.createdAt.toISOString(),
    });
  }

  // ── associatedAccount ──────────────────────────────────────────────────────
  const associatedAccounts: Array<Record<string, string>> = [];

  if (user.redditId && user.redditUsername) {
    associatedAccounts.push({
      type: "social",
      platform: "Reddit",
      thirdPartyUser: user.redditId,
      screenName: user.redditUsername,
      profileUrl: `https://www.reddit.com/user/${user.redditUsername}`,
      espIdentifier: String(user.id),
    });
  }
  if (user.xId && user.xUsername) {
    associatedAccounts.push({
      type: "social",
      platform: "X",
      thirdPartyUser: user.xId,
      screenName: user.xUsername,
      profileUrl: `https://x.com/${user.xUsername}`,
      espIdentifier: String(user.id),
    });
  }
  // Self-declared (unverified) social links
  if (user.instagramUsername) {
    associatedAccounts.push({
      platform: "Instagram",
      screenName: user.instagramUsername,
      profileUrl: `https://www.instagram.com/${user.instagramUsername}`,
    });
  }
  if (user.tiktokUsername) {
    associatedAccounts.push({
      platform: "TikTok",
      screenName: user.tiktokUsername,
      profileUrl: `https://www.tiktok.com/@${user.tiktokUsername}`,
    });
  }
  if (user.onlyfansUrl) {
    associatedAccounts.push({ platform: "OnlyFans", profileUrl: user.onlyfansUrl });
  }
  if (user.fanslyUrl) {
    associatedAccounts.push({ platform: "Fansly", profileUrl: user.fanslyUrl });
  }
  if (user.websiteUrl) {
    associatedAccounts.push({ platform: "website", profileUrl: user.websiteUrl });
  }

  // Build response — omit empty arrays
  const user_enrichment_data: Record<string, unknown> = {
    personOrUserReportedPerson: [personEntry],
  };
  if (ipCaptureEvents.length > 0) {
    user_enrichment_data.ipCaptureEvent = ipCaptureEvents;
  }
  if (associatedAccounts.length > 0) {
    user_enrichment_data.associatedAccount = associatedAccounts;
  }

  req.log.info({ userId: user_id, postId: post_id }, "Hive enrichment served");
  res.json({ user_enrichment_data });
});

// ── POST /hive/callback ───────────────────────────────────────────────────────
// Called by Hive after a CyberTipline report is filed. Idempotent on report_id.
// NEVER reads, stores, or logs image_url.

router.post("/hive/callback", async (req, res) => {
  if (!checkHiveSecret(req, res)) return;

  // Destructure without image_url — it is never referenced below
  const { report_id, post_id, user_id, moderator_email } = req.body as {
    report_id?: string;
    post_id?: string | number;
    user_id?: number;
    moderator_email?: string;
    image_url?: never; // explicitly excluded — CSAM — never touch
  };

  if (!report_id || user_id == null) {
    res.status(400).json({ error: "report_id and user_id required" });
    return;
  }

  // Parse post_id: "<assetType>:<assetId>" or bare numeric id (→ asset_type='post')
  let assetType = "post";
  let assetId = 0;
  if (typeof post_id === "string" && post_id.includes(":")) {
    const colonIdx = post_id.indexOf(":");
    assetType = post_id.slice(0, colonIdx) || "post";
    assetId = parseInt(post_id.slice(colonIdx + 1), 10) || 0;
  } else if (post_id != null) {
    assetId = typeof post_id === "number" ? post_id : parseInt(String(post_id), 10) || 0;
  }

  // Upsert — duplicate report_id is a no-op (idempotent)
  await db
    .insert(ncmecReportsTable)
    .values({
      reportId: report_id,
      assetType,
      assetId,
      userId: user_id,
      moderatorEmail: moderator_email ?? null,
      reportedAt: new Date(),
    })
    .onConflictDoNothing();

  // Auto-suspend offender — human-reviewed, report-filed CSAM finding
  await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, user_id));

  req.log.info(
    { reportId: report_id, assetType, assetId, userId: user_id },
    "NCMEC callback processed — offender suspended",
  );

  res.status(200).json({ ok: true });
});

// ── releasePreservationHolds ──────────────────────────────────────────────────
// Marks preservation_holds.released=true ONLY when:
//   1. An ncmec_report exists for the asset, AND
//   2. now >= reported_at + NCMEC_PRESERVATION_DAYS (default 365)
// Never auto-deletes media. Never releases early.

export async function releasePreservationHolds(
  assetType: string,
  assetId: number,
): Promise<{ released: boolean; reason: string }> {
  const [report] = await db
    .select({ reportedAt: ncmecReportsTable.reportedAt })
    .from(ncmecReportsTable)
    .where(
      and(
        eq(ncmecReportsTable.assetType, assetType),
        eq(ncmecReportsTable.assetId, assetId),
      ),
    )
    .limit(1);

  if (!report) {
    return { released: false, reason: "no_ncmec_report" };
  }

  const preservationDays = Math.max(
    1,
    parseInt(process.env.NCMEC_PRESERVATION_DAYS ?? "365", 10),
  );
  const releaseAfter = new Date(report.reportedAt);
  releaseAfter.setDate(releaseAfter.getDate() + preservationDays);

  if (new Date() < releaseAfter) {
    return { released: false, reason: "retention_not_elapsed" };
  }

  await db
    .update(preservationHoldsTable)
    .set({ released: true })
    .where(
      and(
        eq(preservationHoldsTable.assetType, assetType),
        eq(preservationHoldsTable.assetId, assetId),
      ),
    );

  return { released: true, reason: "ok" };
}

export default router;
