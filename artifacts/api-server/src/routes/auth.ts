import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash, createHmac } from "crypto";
import { db, usersTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { signToken, requireAuth, verifyToken } from "../middlewares/auth";
import { authLimiter } from "../middlewares/rateLimiter";
import { sendWelcomeEmail, sendPasswordResetEmail, BASE_URL } from "../lib/email";
import { isReservedUsername, isValidUsernameFormat } from "../lib/reservedUsernames";
import { logIpEvent } from "../lib/ipEvents";
import jwt from "jsonwebtoken";

// --- Inline TOTP (RFC 6238) — no external dependency needed ---
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): Buffer {
  const str = s.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0, val = 0;
  for (const ch of str) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bytes.push((val >> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += BASE32[(val >> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += BASE32[(val << (5 - bits)) & 31];
  return out;
}
function generateSecret(): string { return base32Encode(randomBytes(20)); }
function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return (n % 1_000_000).toString().padStart(6, "0");
}
function totpVerify(token: string, secret: string): boolean {
  const t = Math.floor(Date.now() / 1000 / 30);
  return [-1, 0, 1].some(d => totpCode(secret, t + d) === token);
}
function totpKeyuri(account: string, issuer: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
// --------------------------------------------------------------

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-prod";

function signTempToken(userId: number): string {
  return jwt.sign({ userId, type: "2fa_pending" }, JWT_SECRET, { expiresIn: "10m" });
}

function verifyTempToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.type !== "2fa_pending") return null;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

const oauthStateStore = new Map<string, { platform: string; expiresAt: number }>();
const pkceStore = new Map<string, { codeVerifier: string; expiresAt: number }>();
function cleanupOAuth() {
  const now = Date.now();
  for (const [k, v] of oauthStateStore) if (v.expiresAt < now) oauthStateStore.delete(k);
  for (const [k, v] of pkceStore) if (v.expiresAt < now) pkceStore.delete(k);
}

const router: IRouter = Router();

const COOKIE_NAME = "g_token";
// In production use strict; in dev (Replit canvas iframes are cross-site) use none so
// cookies survive the replit.com → replit.dev cross-site iframe boundary.
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: (IS_PROD ? "strict" : "none") as "strict" | "none",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: "/",
};

router.post("/auth/register", authLimiter, async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, email, password, displayName } = parsed.data;

  // Username format: 3-30 chars, starts with letter, letters/numbers/underscore/hyphen only
  if (!isValidUsernameFormat(username)) {
    res.status(400).json({ error: "Username must be 3–30 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens." });
    return;
  }

  // Reserved username check (case-insensitive)
  if (isReservedUsername(username)) {
    res.status(400).json({ error: "That username is reserved. Please choose another." });
    return;
  }

  const existing = await db.select().from(usersTable)
    .where(eq(usersTable.email, email)).limit(1);
  if (existing[0]) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const existingUsername = await db.select().from(usersTable)
    .where(eq(usersTable.username, username)).limit(1);
  if (existingUsername[0]) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    username,
    email,
    passwordHash,
    displayName: displayName ?? username,
  }).returning();

  // Create wallet for new user
  await db.insert(walletsTable).values({ userId: user.id });

  // Send welcome email (fire-and-forget)
  sendWelcomeEmail(user.email, user.username);

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  logIpEvent(user.id, req.ip, "signup");

  const { passwordHash: _, totpSecret: _ts1, ...safeUser } = user;
  res.status(201).json({ user: { ...safeUser, followersCount: 0, followingCount: 0, postsCount: 0 }, ...(!IS_PROD && { devToken: token }) });
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  if (user.isAdmin && user.totpEnabled && user.totpSecret) {
    const tempToken = signTempToken(user.id);
    res.json({ requires2fa: true, tempToken });
    return;
  }

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  logIpEvent(user.id, req.ip, "login");

  const { passwordHash: _, totpSecret: _ts2, ...safeUser } = user;
  res.json({ user: safeUser, ...(!IS_PROD && { devToken: token }) });
});

router.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "Email required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  // Always respond with OK to prevent email enumeration
  if (!user) {
    res.json({ ok: true, message: "If that email is registered, you will receive a reset link shortly." });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(usersTable)
    .set({ passwordResetToken: token, passwordResetExpires: expires })
    .where(eq(usersTable.id, user.id));

  const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

  req.log.info({ userId: user.id }, "Password reset requested");

  // Send reset email (fire-and-forget)
  sendPasswordResetEmail(user.email, resetUrl);

  res.json({ ok: true, message: "If that email is registered, you will receive a reset link shortly." });
});

router.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Token and a password of at least 8 characters are required" }); return;
  }

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.passwordResetToken, token)).limit(1);

  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    res.status(400).json({ error: "Reset link is invalid or has expired" }); return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable)
    .set({ passwordHash, passwordResetToken: null, passwordResetExpires: null })
    .where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "Password reset completed");
  res.json({ ok: true });
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Current password and a new password of at least 8 characters are required" });
    return;
  }

  const user = (req as any).user;
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(403).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));

  req.log.info({ userId: user.id }, "Password changed");
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

// ── TOTP 2FA endpoints ─────────────────────────────────────────────────────────

// POST /auth/2fa/setup — generate a TOTP secret + otpauth URI for QR display
// Stores the pending secret in the DB (totpSecret column) so it survives server restarts.
// totpEnabled stays false until /auth/2fa/confirm succeeds.
router.post("/auth/2fa/setup", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  if (user.totpEnabled) { res.status(400).json({ error: "2FA already enabled" }); return; }

  const secret = generateSecret();
  // Persist the pending secret to DB immediately (enabled flag stays false)
  await db.update(usersTable).set({ totpSecret: secret }).where(eq(usersTable.id, user.id));

  const otpauth = totpKeyuri(user.email, "Sweatheory", secret);
  res.json({ secret, otpauth });
});

// POST /auth/2fa/confirm — verify code against pending secret (read from DB), then enable 2FA
router.post("/auth/2fa/confirm", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  if (user.totpEnabled) { res.status(400).json({ error: "2FA already enabled" }); return; }

  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "code required" }); return; }

  // Read the pending secret from DB (stored by /auth/2fa/setup)
  const pendingSecret = user.totpSecret;
  if (!pendingSecret) {
    res.status(400).json({ error: "No pending 2FA setup — call /auth/2fa/setup first" });
    return;
  }

  const valid = totpVerify(code, pendingSecret);
  if (!valid) { res.status(400).json({ error: "Invalid code" }); return; }

  await db.update(usersTable)
    .set({ totpEnabled: true })
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true });
});

// POST /auth/2fa/verify — complete login with TOTP code after password step
router.post("/auth/2fa/verify", async (req, res) => {
  const { tempToken, code } = req.body as { tempToken?: string; code?: string };
  if (!tempToken || !code) { res.status(400).json({ error: "tempToken and code are required" }); return; }

  const payload = verifyTempToken(tempToken);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    res.status(400).json({ error: "2FA not configured" }); return;
  }

  const valid = totpVerify(code, user.totpSecret);
  if (!valid) { res.status(400).json({ error: "Invalid code" }); return; }

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

  const { passwordHash: _, totpSecret: __, ...safeUser } = user;
  res.json({ user: safeUser, ...(!IS_PROD && { devToken: token }) });
});

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: (IS_PROD ? "strict" : "none") as "strict" | "none",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

// ── Reddit OAuth ──────────────────────────────────────────────────────────────

router.get("/auth/reddit", (_req, res) => {
  cleanupOAuth();
  const state = randomBytes(16).toString("hex");
  oauthStateStore.set(state, { platform: "reddit", expiresAt: Date.now() + 10 * 60 * 1000 });
  res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTS);
  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID ?? "",
    response_type: "code",
    state,
    redirect_uri: "https://sweatheory.com/auth/reddit/callback",
    duration: "temporary",
    scope: "identity",
  });
  res.redirect(`https://www.reddit.com/api/v1/authorize?${params}`);
});

router.post("/auth/reddit/callback", async (req, res) => {
  const { code, state } = req.body as { code?: string; state?: string };

  const cookieState = (req.cookies as Record<string, string>)[OAUTH_STATE_COOKIE];
  if (!cookieState || cookieState !== state) {
    res.status(400).json({ error: "Invalid or expired state" }); return;
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

  const stateData = oauthStateStore.get(state ?? "");
  if (!stateData || stateData.platform !== "reddit" || stateData.expiresAt < Date.now()) {
    res.status(400).json({ error: "Invalid or expired state" }); return;
  }
  oauthStateStore.delete(state!);

  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Sweatheory/1.0",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: "https://sweatheory.com/auth/reddit/callback",
    }),
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) {
    res.status(400).json({ error: "Failed to exchange Reddit code" }); return;
  }

  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "Sweatheory/1.0" },
  });
  const rUser = await meRes.json() as any;
  const redditId = String(rUser.id);
  const redditUsername = rUser.name as string;
  const redditKarma = ((rUser.link_karma ?? 0) + (rUser.comment_karma ?? 0)) as number;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.redditId, redditId)).limit(1);
  if (user) {
    await db.update(usersTable).set({ redditUsername, redditKarma }).where(eq(usersTable.id, user.id));
    user = { ...user, redditUsername, redditKarma };
  } else {
    const base = `r_${redditUsername}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 28);
    let username = base; let n = 1;
    while ((await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1))[0]) {
      username = `${base}${n++}`;
    }
    [user] = await db.insert(usersTable).values({
      username, email: `reddit_${redditId}@oauth.sweatheory.com`,
      passwordHash: randomBytes(32).toString("hex"),
      displayName: redditUsername, redditId, redditUsername, redditKarma,
    } as any).returning();
    await db.insert(walletsTable).values({ userId: user.id });
    sendWelcomeEmail(user.email, user.username);
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (user.isAdmin && user.totpEnabled && user.totpSecret) {
    const tempToken = signTempToken(user.id);
    res.json({ requires2fa: true, tempToken });
    return;
  }
  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  logIpEvent(user.id, req.ip, "login");
  req.log.info({ userId: user.id }, "Reddit OAuth login");
  const { passwordHash: _r, totpSecret: _ts3, ...safeUserR } = user;
  res.json({ user: safeUserR, ...(!IS_PROD && { devToken: token }) });
});

// ── X / Twitter OAuth 2.0 (PKCE) ─────────────────────────────────────────────

router.get("/auth/x", (_req, res) => {
  cleanupOAuth();
  const state = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  pkceStore.set(state, { codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 });
  res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTS);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: "https://sweatheory.com/auth/x/callback",
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

router.post("/auth/x/callback", async (req, res) => {
  const { code, state } = req.body as { code?: string; state?: string };

  const cookieState = (req.cookies as Record<string, string>)[OAUTH_STATE_COOKIE];
  if (!cookieState || cookieState !== state) {
    res.status(400).json({ error: "Invalid or expired state" }); return;
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

  const pkceData = pkceStore.get(state ?? "");
  if (!pkceData || pkceData.expiresAt < Date.now()) {
    res.status(400).json({ error: "Invalid or expired state" }); return;
  }
  pkceStore.delete(state!);

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      code: code!,
      grant_type: "authorization_code",
      redirect_uri: "https://sweatheory.com/auth/x/callback",
      code_verifier: pkceData.codeVerifier,
    }),
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) {
    res.status(400).json({ error: "Failed to exchange X code" }); return;
  }

  const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,name", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const xData = await meRes.json() as any;
  const xUser = xData.data;
  const xId = xUser.id as string;
  const xUsername = xUser.username as string;
  const xFollowersCount = (xUser.public_metrics?.followers_count ?? 0) as number;
  const xAvatarUrl: string | null = (xUser.profile_image_url ?? "").replace("_normal", "") || null;
  const xDisplayName = (xUser.name ?? xUsername) as string;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.xId, xId)).limit(1);
  if (user) {
    await db.update(usersTable).set({ xUsername, xFollowersCount }).where(eq(usersTable.id, user.id));
    user = { ...user, xUsername, xFollowersCount };
  } else {
    const base = `x_${xUsername}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 28);
    let username = base; let n = 1;
    while ((await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1))[0]) {
      username = `${base}${n++}`;
    }
    [user] = await db.insert(usersTable).values({
      username, email: `x_${xId}@oauth.sweatheory.com`,
      passwordHash: randomBytes(32).toString("hex"),
      displayName: xDisplayName, avatarUrl: xAvatarUrl,
      xId, xUsername, xFollowersCount,
    } as any).returning();
    await db.insert(walletsTable).values({ userId: user.id });
    sendWelcomeEmail(user.email, user.username);
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (user.isAdmin && user.totpEnabled && user.totpSecret) {
    const tempToken = signTempToken(user.id);
    res.json({ requires2fa: true, tempToken });
    return;
  }
  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  logIpEvent(user.id, req.ip, "login");
  req.log.info({ userId: user.id }, "X OAuth login");
  const { passwordHash: _x, totpSecret: _ts4, ...safeUserX } = user;
  res.json({ user: safeUserX, ...(!IS_PROD && { devToken: token }) });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { passwordHash: _, totpSecret: _ts5, ...safeUser } = user;
  res.json(safeUser);
});

export default router;
