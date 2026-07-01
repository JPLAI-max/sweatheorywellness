import { pgTable, text, serial, integer, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const streamsTable = pgTable("streams", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").notNull().default("live"), // live | ended | scheduled
  isPrivate: boolean("is_private").notNull().default(false),
  isPaid: boolean("is_paid").notNull().default(false),
  accessPrice: numeric("access_price", { precision: 10, scale: 2 }),
  viewerCount: integer("viewer_count").notNull().default(0),
  category: text("category"),
  audienceType: text("audience_type").notNull().default("public"), // public | private | girls_only | guys_only | invite_only
  watchPartyUrl: text("watch_party_url"),
  muxLiveStreamId: text("mux_live_stream_id"),
  muxPlaybackId: text("mux_playback_id"),
  muxStreamKey: text("mux_stream_key"),
  muxAssetId: text("mux_asset_id"),
  // CSAM scan columns — mirror posts schema; recording is NOT served until scan_status='clean'
  scanStatus: text("scan_status").$type<"pending" | "clean" | "blocked" | "error">().notNull().default("pending"),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
});

export const insertStreamSchema = createInsertSchema(streamsTable).omit({ id: true, createdAt: true, endedAt: true, viewerCount: true });
export type InsertStream = z.infer<typeof insertStreamSchema>;
export type Stream = typeof streamsTable.$inferSelect;
