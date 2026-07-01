import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./middlewares/rateLimiter";
import { renderProfileOgPage } from "./lib/ogPage";
import { cleanupStaleStreams } from "./routes/streams";
import { reconcileStuckMerchOrders } from "./routes/merch";

const PROD_ORIGINS = ["https://sweatheory.com", "https://www.sweatheory.com"];
const IS_PROD = process.env.NODE_ENV === "production";

function isAllowedOrigin(origin: string): boolean {
  if (PROD_ORIGINS.includes(origin)) return true;
  // Allow Replit preview/dev domains only in development — never in production
  if (!IS_PROD && (origin.endsWith(".replit.dev") || origin.endsWith(".janeway.replit.dev"))) return true;
  return false;
}

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Resolve the R2 public-media host if a custom domain is configured
const _r2MediaPublicOrigin = (() => {
  const u = process.env.R2_MEDIA_PUBLIC_URL ?? "";
  if (!u) return null;
  try { return new URL(u).origin; } catch { return null; }
})();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Start from helmet's secure defaults, then extend only what we need
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),

      // Images: R2 presigned URLs (path-style: {accountId}.r2.cloudflarestorage.com),
      // optional R2 public-media custom domain, Printify CDN, Mux thumbnails
      "img-src": [
        "'self'", "data:",
        "https://*.r2.cloudflarestorage.com",
        ...(_r2MediaPublicOrigin ? [_r2MediaPublicOrigin] : []),
        "https://images.printify.com",
        "https://images-cdn.printify.com",
        "https://image.mux.com",
      ],

      // Video: Mux HLS streams + hls.js MSE blob: URLs
      "media-src": ["'self'", "blob:", "https://stream.mux.com"],

      // XHR/fetch: Mux HLS manifest + segment requests (hls.js fetches these)
      "connect-src": ["'self'", "https://stream.mux.com"],

      // Web workers: hls.js spins up a blob: worker for segment demuxing
      "worker-src": ["'self'", "blob:"],

      // Iframes: YouTube + Vimeo for the Watch Party embed player
      "frame-src": ["'self'", "https://www.youtube.com", "https://player.vimeo.com"],
    },
  },
}));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  }),
);
// Capture raw body for webhook signature verification before JSON parsing
app.use("/api/mux/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", globalLimiter);
app.use("/api", router);

// ── OG / link-preview route for /@:username ────────────────────────────────
// Must be registered AFTER /api routes so API calls are never intercepted.
// Scrapers (Linktree, Beacons, Discord, iMessage) hit this and receive the
// standard index.html with creator-specific Open Graph tags injected at the
// top of <head>. Human browsers load the React SPA which then takes over.
app.get(/^\/@([A-Za-z0-9_-]+)$/, async (req: Request, res: Response) => {
  const username = (req.params as Record<string, string>)[0];
  try {
    const html = await renderProfileOgPage(username);
    if (!html) {
      // Unknown username — still serve the SPA (it will show a 404 page)
      res.redirect(302, `/?ref=@${username}`);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.send(html);
  } catch (err) {
    req.log.error({ err }, "OG page render error");
    res.redirect(302, "/");
  }
});

// ── STALE STREAM CLEANUP ───────────────────────────────────────────────────
// Run once on startup (catches streams left over from a server restart) then
// every 5 minutes.
cleanupStaleStreams()
  .then(n => { if (n > 0) logger.info({ count: n }, "Cleaned up stale streams on startup"); })
  .catch(err => logger.error({ err }, "Stale stream cleanup error"));

setInterval(() => {
  cleanupStaleStreams()
    .then(n => { if (n > 0) logger.info({ count: n }, "Cleaned up stale streams"); })
    .catch(err => logger.error({ err }, "Stale stream cleanup error"));
}, 5 * 60 * 1000);

// ── MERCH ORDER RECONCILE ──────────────────────────────────────────────────
// Resolves orders stuck in pending_fulfillment (server crashed between TX1 and TX2/TX2').
// Run once on startup then every 10 minutes.
reconcileStuckMerchOrders()
  .then(r => { if (r.processed > 0) logger.info(r, "Merch reconcile on startup"); })
  .catch(err => logger.error({ err }, "Merch reconcile startup error"));

setInterval(() => {
  reconcileStuckMerchOrders()
    .then(r => { if (r.processed > 0) logger.info(r, "Merch reconcile sweep"); })
    .catch(err => logger.error({ err }, "Merch reconcile error"));
}, 10 * 60 * 1000);

export default app;
