import { pgTable, serial, integer, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const reactionsTable = pgTable("reactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  emoji: varchar("emoji", { length: 10 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.postId, t.emoji)]);

export type Reaction = typeof reactionsTable.$inferSelect;
