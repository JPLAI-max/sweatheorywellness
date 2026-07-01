import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const muxCleanupLogTable = pgTable("mux_cleanup_log", {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull(),
  muxAssetId: text("mux_asset_id"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  durationSeconds: integer("duration_seconds"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MuxCleanupLog = typeof muxCleanupLogTable.$inferSelect;
