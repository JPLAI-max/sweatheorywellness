import { pgTable, text, serial, integer, timestamp, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category"),
  imageUrl: text("image_url"),
  type: text("type").notNull().default("digital"),
  status: text("status").notNull().default("active"),
  salesCount: integer("sales_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.buyerId, t.listingId)]);

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, salesCount: true, status: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
