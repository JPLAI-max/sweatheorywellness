import { pgTable, serial, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { streamsTable } from "./streams";

export const streamPurchasesTable = pgTable("stream_purchases", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").notNull().references(() => streamsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.streamId, t.userId)]);
