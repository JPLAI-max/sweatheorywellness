import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── In-memory token cache ────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // unix ms

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch("https://api.redgifs.com/v2/auth/temporary");
  if (!res.ok) throw new Error(`RedGifs token fetch failed: ${res.status}`);
  const data = await res.json() as { token: string };
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // 23 h (tokens last 24 h)
  logger.info("RedGifs token refreshed");
  return cachedToken;
}

function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

// ─── GET /api/gifs/token ──────────────────────────────────────────────────────
// Kept for backwards compat but no longer called by the frontend.

router.get("/gifs/token", async (_req, res) => {
  try {
    const token = await getToken();
    res.json({ token });
  } catch (e: any) {
    res.status(503).json({ error: "GIF search temporarily unavailable. Try again in a moment." });
  }
});

// ─── GET /api/gifs/search?q=…&count=… ────────────────────────────────────────

router.get("/gifs/search", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const count = Math.min(Number(req.query.count ?? 20), 50);

  async function doSearch(token: string): Promise<Response> {
    return fetch(
      `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(q!)}&count=${count}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  try {
    let token = await getToken();
    let upstream = await doSearch(token);

    // On 401: invalidate + retry once with a fresh token
    if (upstream.status === 401) {
      invalidateToken();
      token = await getToken();
      upstream = await doSearch(token);
    }

    // Pass 429 back to the caller with its Retry-After header
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("Retry-After");
      if (retryAfter) res.set("Retry-After", retryAfter);
      res.status(429).json({ error: "Too many searches. Wait a moment and try again." });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({ error: "GIF search temporarily unavailable. Try again in a moment." });
      return;
    }

    const data = await upstream.json() as { gifs?: any[] };
    res.json({ gifs: data.gifs ?? [] });
  } catch (e: any) {
    logger.error({ err: e }, "RedGifs proxy error");
    res.status(503).json({ error: "GIF search temporarily unavailable. Try again in a moment." });
  }
});

// ─── GET /api/gifs/thumb?url=… ───────────────────────────────────────────────
// Proxies a media.redgifs.com thumbnail image server-side so the auth token
// is included and adult-content thumbnails are not replaced with placeholders.

const ALLOWED_THUMB_HOST = "media.redgifs.com";

router.get("/gifs/thumb", async (req, res) => {
  const rawUrl = (req.query.url as string | undefined)?.trim();
  if (!rawUrl) { res.status(400).json({ error: "url is required" }); return; }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid url" }); return;
  }

  // Only proxy from media.redgifs.com to prevent open-redirect abuse
  if (parsed.hostname !== ALLOWED_THUMB_HOST) {
    res.status(400).json({ error: "Disallowed host" }); return;
  }

  try {
    const token = await getToken();
    const upstream = await fetch(rawUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      res.status(upstream.status).end(); return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600"); // 1 h — thumbnails don't change
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    logger.error({ err: e }, "RedGifs thumb proxy error");
    res.status(502).end();
  }
});

export default router;
