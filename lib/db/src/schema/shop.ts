import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shopItemsTable = pgTable("shop_items", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("brand"),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url"),
  affiliateUrl: text("affiliate_url"),
  category: text("category"),
  badge: text("badge"),
  commission: text("commission"),
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShopItemSchema = createInsertSchema(shopItemsTable).omit({ id: true, createdAt: true });
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type ShopItem = typeof shopItemsTable.$inferSelect;
