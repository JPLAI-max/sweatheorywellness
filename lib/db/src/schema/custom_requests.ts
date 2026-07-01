import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customRequestsTable = pgTable("custom_requests", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  contentType: text("content_type").notNull(), // video | photo | message | shoutout | music | art | other
  budget: numeric("budget", { precision: 12, scale: 2 }).notNull(),
  deadline: text("deadline"),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | counteroffered | in_progress | delivered | cancelled | completed
  referenceUrl: text("reference_url"),
  counterofferPrice: numeric("counteroffer_price", { precision: 12, scale: 2 }),
  creatorNote: text("creator_note"),
  deliveryUrl: text("delivery_url"),
  deliveryNote: text("delivery_note"),
  isPrivate: boolean("is_private").notNull().default(true),
  isPaidUpfront: boolean("is_paid_upfront").notNull().default(false),
  platformFee: numeric("platform_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customRequestMessagesTable = pgTable("custom_request_messages", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => customRequestsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomRequest = typeof customRequestsTable.$inferSelect;
export type CustomRequestMessage = typeof customRequestMessagesTable.$inferSelect;
