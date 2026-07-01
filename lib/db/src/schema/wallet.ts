import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  totalEarned: numeric("total_earned", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // tip | deposit | withdrawal | purchase | fee
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("completed"), // pending | completed | failed
  description: text("description"),
  relatedUserId: integer("related_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
export type Wallet = typeof walletsTable.$inferSelect;
