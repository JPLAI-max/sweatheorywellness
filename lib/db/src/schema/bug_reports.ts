import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const BUG_REPORT_ISSUE_TYPES = ["bug", "content_report", "account_issue", "other"] as const;
export type BugReportIssueType = typeof BUG_REPORT_ISSUE_TYPES[number];

export const BUG_REPORT_STATUSES = ["pending", "reviewed", "resolved"] as const;

export const bugReportsTable = pgTable("bug_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  issueType: text("issue_type").notNull(),
  description: text("description").notNull(),
  contactEmail: text("contact_email").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BugReport = typeof bugReportsTable.$inferSelect;
