import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const EMAIL = "admin@gooncity.net";
const TEMP_PASSWORD = "GoonCity2026!";

const hash = await bcrypt.hash(TEMP_PASSWORD, 10);

const [updated] = await db
  .update(usersTable)
  .set({ passwordHash: hash, passwordResetToken: null, passwordResetExpires: null })
  .where(eq(usersTable.email, EMAIL))
  .returning({ id: usersTable.id, username: usersTable.username, email: usersTable.email });

if (!updated) {
  console.error(`No user found with email: ${EMAIL}`);
  process.exit(1);
}

console.log(`Password reset for user: ${updated.username} (id=${updated.id}, email=${updated.email})`);
console.log("Temporary password: GoonCity2026!");
console.log("Have the user change it immediately after logging in.");
process.exit(0);
