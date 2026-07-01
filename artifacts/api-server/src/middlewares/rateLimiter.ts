import rateLimit from "express-rate-limit";

const isDev = process.env["NODE_ENV"] === "development";

// Global limiter — all /api routes
// 300 req per 15 min per IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: () => isDev && false,
});

// Auth limiter — login / register / password reset
// 10 attempts per 15 min per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

// Bid limiter — place bid / buy now
// 30 per minute per IP (anti-snipe spam)
export const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 10_000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Bidding too fast. Please wait a moment." },
});

// Wallet limiter — deposit / withdraw / tip
// 20 per 15 min per IP (prevent transaction spam)
export const walletLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many wallet transactions. Please try again later." },
});

// Upload / create content limiter — post / stream / auction creation
// 50 per 15 min per IP
export const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
