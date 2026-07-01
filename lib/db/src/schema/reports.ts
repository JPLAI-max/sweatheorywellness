import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Generic user-submitted content report.
// content_type / content_id are purposely plain text — not FK-constrained —
// so a single table can cover live_stream, post, user, and dm targets.
export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(), // 'live_stream'|'post'|'user'|'dm'
  contentId: text("content_id").notNull(),
  reason: text("reason").notNull(), // 'underage_csam'|'non_consensual'|'violence'|'harassment'|'spam'|'other'
  note: text("note"),
  status: text("status").notNull().default("open"), // 'open'|'dismissed'|'actioned'
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reports_status_reason_created_idx").on(t.status, t.reason, t.createdAt),
]);
