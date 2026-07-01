import { pgTable, text, serial, integer, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auctionsTable = pgTable("auctions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  category: text("category"),
  tags: text("tags").array(),
  condition: text("condition").notNull().default("new"),
  itemType: text("item_type").notNull().default("physical"),
  startingBid: numeric("starting_bid", { precision: 10, scale: 2 }).notNull(),
  reservePrice: numeric("reserve_price", { precision: 10, scale: 2 }),
  buyNowPrice: numeric("buy_now_price", { precision: 10, scale: 2 }),
  currentBid: numeric("current_bid", { precision: 10, scale: 2 }),
  currentBidderId: integer("current_bidder_id").references(() => usersTable.id),
  bidCount: integer("bid_count").notNull().default(0),
  watchCount: integer("watch_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  shippingInfo: text("shipping_info"),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  scanStatus: text("scan_status").$type<"pending" | "clean" | "blocked" | "error">().notNull().default("pending"),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auctionBidsTable = pgTable("auction_bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull().references(() => auctionsTable.id, { onDelete: "cascade" }),
  bidderId: integer("bidder_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  isWinning: boolean("is_winning").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auctionWatchesTable = pgTable("auction_watches", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull().references(() => auctionsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuctionSchema = createInsertSchema(auctionsTable).omit({
  id: true, createdAt: true, currentBid: true, currentBidderId: true, bidCount: true, watchCount: true, status: true,
});
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Auction = typeof auctionsTable.$inferSelect;
export type AuctionBid = typeof auctionBidsTable.$inferSelect;
