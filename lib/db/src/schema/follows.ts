import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  followingId: integer("following_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.followerId, t.followingId)]);

export type Follow = typeof followsTable.$inferSelect;
