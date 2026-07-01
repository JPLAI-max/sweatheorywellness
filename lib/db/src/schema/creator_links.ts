import { pgTable, uuid, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const creatorLinksTable = pgTable("creator_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  position: integer("position").notNull(),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  clickCount: integer("click_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("creator_links_user_position_idx").on(t.userId, t.position),
]);

export type CreatorLink = typeof creatorLinksTable.$inferSelect;
