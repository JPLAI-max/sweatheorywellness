import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  subscriberId: integer("subscriber_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"), // active | cancelled | expired
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
