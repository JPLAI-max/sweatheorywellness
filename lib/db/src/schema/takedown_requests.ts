import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";

export const takedownRequestsTable = pgTable("takedown_requests", {
  id: serial("id").primaryKey(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  signature: text("signature").notNull(),
  relationship: text("relationship").notNull().default("self"), // self | authorized_rep
  contentUrl: text("content_url").notNull(),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  statement: text("statement").notNull(),
  status: text("status").notNull().default("pending"), // pending | removed | rejected
  rejectionReason: text("rejection_reason"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TakedownRequest = typeof takedownRequestsTable.$inferSelect;
