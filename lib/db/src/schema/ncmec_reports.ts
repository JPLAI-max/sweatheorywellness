import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ncmecReportsTable = pgTable("ncmec_reports", {
  id: serial("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),
  assetType: text("asset_type").notNull(),
  assetId: integer("asset_id").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  moderatorEmail: text("moderator_email"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ncmec_reports_asset_idx").on(t.assetType, t.assetId),
  index("ncmec_reports_user_idx").on(t.userId),
]);

export type NcmecReport = typeof ncmecReportsTable.$inferSelect;
