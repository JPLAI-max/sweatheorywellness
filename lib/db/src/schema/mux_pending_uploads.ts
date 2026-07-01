import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const muxPendingUploadsTable = pgTable("mux_pending_uploads", {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  muxAssetId: text("mux_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MuxPendingUpload = typeof muxPendingUploadsTable.$inferSelect;
