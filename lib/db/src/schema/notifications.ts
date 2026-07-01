import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // follow | like | comment | tip | stream_live | mention
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  actorId: integer("actor_id").references(() => usersTable.id),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
