import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { streamsTable } from "./streams";

export const streamInvitesTable = pgTable("stream_invites", {
  id: serial("id").primaryKey(),
  streamId: integer("stream_id").notNull().references(() => streamsTable.id, { onDelete: "cascade" }),
  invitedUserId: integer("invited_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.streamId, t.invitedUserId)]);

export type StreamInvite = typeof streamInvitesTable.$inferSelect;
