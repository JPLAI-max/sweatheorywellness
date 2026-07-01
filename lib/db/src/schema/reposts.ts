import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const repostsTable = pgTable("reposts", {
  id: serial("id").primaryKey(),
  reposterId: integer("reposter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  originalPostId: integer("original_post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  originalAuthorId: integer("original_author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("uq_repost").on(t.reposterId, t.originalPostId),
]);

export type Repost = typeof repostsTable.$inferSelect;
