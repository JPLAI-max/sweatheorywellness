# Sweatheory Wellness

Sweatheory Wellness is a full-stack wellness community platform where users document their journeys, share what works, live stream, send direct messages, tip creators, and grow a following — all in one warm-themed app. Mission: **Find What Works.**

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/g run dev` — run the frontend (port 23345, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui + Framer Motion + wouter routing
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (`SESSION_SECRET`), stored as an `httpOnly, secure, sameSite=strict` cookie (`g_token`) — not readable by JS
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/g/` — React + Vite frontend
  - `src/pages/` — all page components (Landing, Feed, Explore, Profile, PostDetail, StreamPage, GoLive, Messages, Wallet, Notifications, Settings, Login, Register)
  - `src/components/` — Layout (sidebar + bottom nav), Avatar, PostCard, StreamCard, UserCard, SkeletonLoader
  - `src/hooks/useCurrentUser.ts` — auth state hook
  - `src/lib/auth.ts` — auth state helpers (`isLoggedIn`, `setLoggedIn`, `clearAuth`, `logout`, multi-account metadata without tokens)
- `artifacts/api-server/` — Express 5 backend
  - `src/routes/` — auth, users, posts, comments, streams, messages, wallet, hashtags, notifications
  - `src/middlewares/auth.ts` — `requireAuth` + `optionalAuth` JWT middleware
  - `src/lib/helpers.ts` — `getUserSummaries()` helper
- `lib/db/` — Drizzle ORM + PostgreSQL schema (users, follows, posts, likes, comments, streams, messages, wallet, notifications)
- `lib/api-spec/` — OpenAPI spec → codegen → `lib/api-client-react/` hooks + `lib/api-zod/` schemas

## Architecture decisions

- Username-based profile URLs: `GET /api/users/:userId` accepts either a numeric ID **or** a username string (falls back to username lookup when `parseInt` returns NaN)
- Dark mode applied directly via `document.documentElement.classList.add("dark")` in `main.tsx` — no ThemeProvider dependency to avoid React duplication errors
- JWT cookie (`g_token`) sent automatically via `credentials: "include"` on every fetch — injected in `lib/api-client-react/src/custom-fetch.ts`; no Authorization header used
- Wallet balances stored as Postgres `numeric` (string); converted to `Number()` at response time
- `accessPrice` on streams stored as string in DB (numeric type), converted on insert/read

## Product

- **Social feed**: post text, photos, videos with hashtags; like and comment
- **Explore**: trending posts + hashtag discovery with search
- **Creator profiles**: bio, follower stats, post history, follow/unfollow
- **Livestreaming**: go live, browse live streams, tip streamers
- **Direct messages**: 1:1 conversations
- **Wallet**: deposit, withdraw, tip creators (5% fee on tips, 2% on withdrawals)
- **Notifications**: activity alerts, mark-all-read

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — api-server depends on emitted declarations from the composite libs
- Express 5 types `req.params.xxx` as `string | string[]` — always cast with `as string` before using
- `next-themes` causes React duplication errors in this setup — use direct `classList.add("dark")` instead
- Do not run `pnpm dev` at workspace root — use `restart_workflow` instead

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
