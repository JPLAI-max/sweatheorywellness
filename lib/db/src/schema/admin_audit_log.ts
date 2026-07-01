import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
