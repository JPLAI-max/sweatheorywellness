import { pgTable, text, serial, integer, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const MERCH_PRODUCT_TYPES = [
  "shirt", "hoodie", "hat", "poster", "sticker",
  "mug", "tote_bag", "phone_case", "vinyl_cover", "sweatpants",
] as const;

export const MERCH_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "one-size"] as const;

export const merchProductsTable = pgTable("merch_products", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  productType: text("product_type").notNull().default("shirt"),
  designUrl: text("design_url"),
  previewImageUrl: text("preview_image_url"),
  colors: text("colors").array().notNull().default([]),
  sizes: text("sizes").array().notNull().default([]),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  creatorProfit: numeric("creator_profit", { precision: 10, scale: 2 }).notNull(),
  tags: text("tags").array().notNull().default([]),
  status: text("status").notNull().default("active"),
  salesCount: integer("sales_count").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  isLimitedDrop: boolean("is_limited_drop").notNull().default(false),
  stockLimit: integer("stock_limit"),
  // Printify integration fields
  printifyShopId: text("printify_shop_id"),
  printifyProductId: text("printify_product_id"),
  printifyBlueprintId: integer("printify_blueprint_id"),
  printifyPrintProviderId: integer("printify_print_provider_id"),
  printifyVariantsJson: text("printify_variants_json"),
  scanStatus: text("scan_status").$type<"pending" | "clean" | "blocked" | "error">().notNull().default("pending"),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchOrdersTable = pgTable("merch_orders", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => merchProductsTable.id),
  productTitle: text("product_title").notNull(),
  productType: text("product_type").notNull(),
  designUrl: text("design_url"),
  color: text("color"),
  size: text("size"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull(),
  creatorPayout: numeric("creator_payout", { precision: 10, scale: 2 }).notNull(),
  shippingName: text("shipping_name").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingZip: text("shipping_zip").notNull(),
  shippingCountry: text("shipping_country").notNull().default("US"),
  status: text("status").notNull().default("processing"),
  trackingNumber: text("tracking_number"),
  fulfillmentId: text("fulfillment_id"),
  // Printify integration
  printifyVariantId: integer("printify_variant_id"),
  printifyCost: integer("printify_cost"),
  ccbillFee: integer("ccbill_fee"),
  margin: integer("margin"),
  // Idempotency + transaction linkage
  idempotencyKey: text("idempotency_key").unique(),
  buyerTxnId: integer("buyer_txn_id"),
  refundReason: text("refund_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMerchProductSchema = createInsertSchema(merchProductsTable).omit({
  id: true, createdAt: true, updatedAt: true, salesCount: true, status: true, isFeatured: true,
});

export type InsertMerchProduct = z.infer<typeof insertMerchProductSchema>;
export type MerchProduct = typeof merchProductsTable.$inferSelect;
export type MerchOrder = typeof merchOrdersTable.$inferSelect;
