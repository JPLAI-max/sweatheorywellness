import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { createLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();

function extractOg(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"'<>]+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']og:${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractFallback(html: string, prop: string): string | null {
  if (prop === "title") {
    const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    return m?.[1]?.trim() ?? null;
  }
  if (prop === "description") {
    const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"'<>]+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"'<>]+)["'][^>]+name=["']description["']/i);
    return m?.[1]?.trim() ?? null;
  }
  return null;
}

router.get("/link-preview", requireAuth, createLimiter, async (req, res) => {
  const { url } = req.query as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" }); return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).json({ error: "Only http/https URLs are supported" }); return;
    }
  } catch {
    res.status(400).json({ error: "Invalid URL" }); return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Twitterbot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(422).json({ error: "Could not fetch that URL" }); return;
    }

    const html = await response.text();
    const domain = parsed.hostname.replace(/^www\./, "");

    const title = extractOg(html, "title") ?? extractFallback(html, "title") ?? domain;
    const description = extractOg(html, "description") ?? extractFallback(html, "description");
    const image = extractOg(html, "image");

    res.json({
      title: title.slice(0, 200),
      description: description ? description.slice(0, 500) : null,
      image: image || null,
      domain,
      url: parsed.href,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      res.status(408).json({ error: "Request timed out" }); return;
    }
    req.log.warn({ err, url }, "link-preview: fetch failed");
    res.status(422).json({ error: "Could not fetch that URL" });
  }
});

export default router;
