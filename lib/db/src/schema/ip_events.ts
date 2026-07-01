import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ipEventsTable = pgTable("ip_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address").notNull(),
  eventName: text("event_name").$type<"signup" | "login" | "post_create" | "stream_start" | "upload">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ip_events_user_created_idx").on(t.userId, t.createdAt),
]);

export type IpEvent = typeof ipEventsTable.$inferSelect;
