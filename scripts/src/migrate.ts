/**
 * Idempotent schema migration — adds columns / tables that were added to the
 * Drizzle schema but never pushed to the Postgres database.
 *
 * Run in Replit where DATABASE_URL is set:
 *   pnpm --filter @workspace/scripts run migrate
 *
 * Every statement uses IF NOT EXISTS / DO NOTHING so it is safe to re-run.
 */

import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function run(label: string, sql: string) {
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } catch (err: any) {
    console.error(`✗ ${label}: ${err.message}`);
    throw err;
  }
}

// ── users table — columns added since initial deploy ──────────────────────────

await run(
  "users.subscription_price column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_price NUMERIC(10,2)`,
);

await run(
  "users.is_age_verified column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_age_verified BOOLEAN NOT NULL DEFAULT false`,
);

await run(
  "users.verification_method column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_method TEXT`,
);

await run(
  "users.verification_state column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_state TEXT`,
);

await run(
  "users.verified_at column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
);

await run(
  "users.password_reset_token column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`,
);

await run(
  "users.password_reset_expires column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`,
);

await run(
  "users.id_image_url column",
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS id_image_url TEXT`,
);

// ── subscriptions table ───────────────────────────────────────────────────────

await run(
  "subscriptions table",
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id                  SERIAL PRIMARY KEY,
    subscriber_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price               NUMERIC(10,2) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ NOT NULL,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
);

await run(
  "subscriptions unique index",
  `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_subscriber_creator_idx
   ON subscriptions (subscriber_id, creator_id)`,
);

// ── reports table — status column (may be missing on older deploys) ───────────

await run(
  "reports.status column default",
  `ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'pending'`,
);

await client.end();
console.log("\nMigration complete.");
