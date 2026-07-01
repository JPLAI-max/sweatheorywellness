import bcrypt from "bcryptjs";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const EMAIL = "admin@gooncity.net";
const USERNAME = "admin";
const PASSWORD = "GoonCity2026!";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const hash = await bcrypt.hash(PASSWORD, 10);

const existing = await client.query(
  "SELECT id, username FROM users WHERE email = $1",
  [EMAIL]
);

if (existing.rows.length > 0) {
  await client.query(
    "UPDATE users SET password_hash = $1, is_admin = true, password_reset_token = NULL, password_reset_expires = NULL WHERE email = $2",
    [hash, EMAIL]
  );
  console.log(`Admin password reset. id=${existing.rows[0].id} username=${existing.rows[0].username}`);
} else {
  const result = await client.query(
    `INSERT INTO users (username, email, password_hash, display_name, is_admin, is_verified, account_tier)
     VALUES ($1, $2, $3, 'Admin', true, true, 'free')
     RETURNING id, username`,
    [USERNAME, EMAIL, hash]
  );
  const user = result.rows[0];
  await client.query(
    "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [user.id]
  );
  console.log(`Admin user created. id=${user.id} username=${user.username}`);
}

await client.end();
console.log(`\nLogin credentials:\n  Email:    ${EMAIL}\n  Password: ${PASSWORD}`);
process.exit(0);
