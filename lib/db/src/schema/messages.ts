import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const messagesTable = pgTable("dm_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  isRead: boolean("is_read").notNull().default(false),
  scanStatus: text("scan_status").$type<"pending" | "clean" | "blocked" | "error">().notNull().default("pending"),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DmMessage = typeof messagesTable.$inferSelect;
