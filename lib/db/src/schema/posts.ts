import { pgTable, text, serial, timestamp, boolean, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("text"), // text | photo | video
  caption: text("caption").notNull(),
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),
  hashtags: text("hashtags").array().notNull().default([]),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  viewsCount: integer("views_count").notNull().default(0),
  repostsCount: integer("reposts_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  contentRating: text("content_rating").notNull().default("safe"),
  visibility: text("visibility").notNull().default("public"), // public | followers | subscribers_only
  price: numeric("price", { precision: 12, scale: 2 }),
  allowDownload: boolean("allow_download").notNull().default(false),
  downloadPrice: numeric("download_price", { precision: 12, scale: 2 }),
  embedUrl: text("embed_url"),
  displayAspect: text("display_aspect"), // "auto" | "9/16" | "1/1" | "16/9"
  trimStart: numeric("trim_start", { precision: 10, scale: 3 }),
  trimEnd: numeric("trim_end", { precision: 10, scale: 3 }),
  mediaItems: jsonb("media_items").$type<string[]>(),
  linkPreview: jsonb("link_preview").$type<{ title: string; description: string | null; image: string | null; domain: string; url: string }>(),
  scanStatus: text("scan_status").$type<"pending" | "clean" | "blocked" | "error">().notNull().default("pending"),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true, likesCount: true, commentsCount: true, viewsCount: true, scanStatus: true, scanResultJson: true, scannedAt: true, needsNcmecReport: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
