import { pgTable, uuid, integer, boolean, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { postsTable } from "./posts";

export const consentRecordsTable = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  uploaderId: integer("uploader_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  consentToPublish: boolean("consent_to_publish").notNull(),
  allDepictedConsented: boolean("all_depicted_consented").notNull(),
  allDepicted18Plus: boolean("all_depicted_18_plus").notNull(),
  depictsOthers: boolean("depicts_others").notNull(),
  attestationVersion: text("attestation_version").notNull(),
  electronicSignature: text("electronic_signature").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("consent_records_post_id_unique").on(t.postId),
]);

export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
export type NewConsentRecord = typeof consentRecordsTable.$inferInsert;

/*
 * COUNSEL FLAG (v1 — uploader attestation only):
 * This table captures the uploading user's attestation that all depicted
 * persons have consented and are 18+.  The `depictsOthers` boolean flags
 * whether any person OTHER than the uploader appears in the content.
 * An open legal question for counsel: whether uploader attestation
 * suffices for content depicting co-performers, or whether each
 * depicted co-performer must separately supply a verified 2257 performer
 * record plus their own individual consent record.  v1 captures only
 * uploader attestation; co-performer verification depth is a counsel call.
 */
