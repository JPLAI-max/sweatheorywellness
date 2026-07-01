import { pgTable, uuid, integer, text, date, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const performerRecordsTable = pgTable("performer_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  idType: text("id_type").notNull(), // passport | drivers_license | state_id | other
  idIssuingCountry: text("id_issuing_country").notNull(),
  idVerificationTimestamp: timestamp("id_verification_timestamp", { withTimezone: true }).notNull().defaultNow(),
  veriffSessionId: text("veriff_session_id"),
  custodianAddress: text("custodian_address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("performer_records_user_id_unique").on(t.userId),
]);

export const contentPerformerRecordsTable = pgTable("content_performer_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  performerRecordId: uuid("performer_record_id").notNull().references(() => performerRecordsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PerformerRecord = typeof performerRecordsTable.$inferSelect;
export type ContentPerformerRecord = typeof contentPerformerRecordsTable.$inferSelect;
