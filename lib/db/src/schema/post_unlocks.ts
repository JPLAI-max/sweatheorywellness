import { pgTable, serial, integer, numeric, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const postUnlocksTable = pgTable("post_unlocks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull(),
  hasDownloadAccess: boolean("has_download_access").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.postId)]);

export type PostUnlock = typeof postUnlocksTable.$inferSelect;
