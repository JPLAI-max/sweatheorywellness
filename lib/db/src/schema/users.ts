import { pgTable, text, serial, timestamp, boolean, integer, bigint, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  avatarScanStatus: text("avatar_scan_status").$type<"pending" | "clean" | "blocked">().notNull().default("pending"),
  bannerScanStatus: text("banner_scan_status").$type<"pending" | "clean" | "blocked">().notNull().default("pending"),
  needsNcmecReport: boolean("needs_ncmec_report").notNull().default(false),
  scanResultJson: jsonb("scan_result_json"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  isVerified: boolean("is_verified").notNull().default(false),
  isPremium: boolean("is_premium").notNull().default(false),
  accountTier: text("account_tier").notNull().default("free"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
  idVerificationStatus: text("id_verification_status").notNull().default("none"),
  idImageUrl: text("id_image_url"),
  gender: text("gender"), // male | female | other | null
  isNsfwCreator: boolean("is_nsfw_creator").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  nsfwFilter: text("nsfw_filter").notNull().default("blur"),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  postsCount: integer("posts_count").notNull().default(0),
  profileSongUrl: text("profile_song_url"),
  profileSongTitle: text("profile_song_title"),
  profileSongArtist: text("profile_song_artist"),
  interests: text("interests").array(),
  subscriptionPrice: numeric("subscription_price", { precision: 10, scale: 2 }),
  isAgeVerified: boolean("is_age_verified").notNull().default(false),
  verificationMethod: text("verification_method"), // 'veriff' | 'self_declaration'
  verificationState: text("verification_state"), // detected US state code e.g. "TX"
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  redditId: text("reddit_id").unique(),
  redditUsername: text("reddit_username"),
  redditKarma: integer("reddit_karma"),
  xId: text("x_id").unique(),
  xUsername: text("x_username"),
  xFollowersCount: integer("x_followers_count"),
  avatarColor: text("avatar_color"),
  websiteUrl: text("website_url"),
  instagramUsername: text("instagram_username"),
  tiktokUsername: text("tiktok_username"),
  onlyfansUrl: text("onlyfans_url"),
  fanslyUrl: text("fansly_url"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires", { withTimezone: true }),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, followersCount: true, followingCount: true, postsCount: true, scanResultJson: true, scannedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
