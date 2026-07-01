import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationParticipantsTable = pgTable("conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
});

export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationParticipant = typeof conversationParticipantsTable.$inferSelect;
