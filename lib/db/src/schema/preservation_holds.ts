import { pgTable, serial, text, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const preservationHoldsTable = pgTable("preservation_holds", {
  id: serial("id").primaryKey(),
  identifierType: text("identifier_type").$type<"r2_key" | "mux_asset">().notNull(),
  identifierValue: text("identifier_value").notNull(),
  assetType: text("asset_type").notNull(),
  assetId: integer("asset_id").notNull(),
  reason: text("reason").notNull().default("csam_block"),
  released: boolean("released").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("preservation_holds_identifier_unique").on(t.identifierType, t.identifierValue),
  index("preservation_holds_lookup_idx").on(t.identifierType, t.identifierValue, t.released),
]);
