import { pgTable, text, serial, integer, timestamp, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const meetupsTable = pgTable("meetups", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  location: text("location"),
  virtualUrl: text("virtual_url"),
  isVirtual: boolean("is_virtual").notNull().default(false),
  category: text("category"),
  maxAttendees: integer("max_attendees"),
  coverImageUrl: text("cover_image_url"),
  status: text("status").notNull().default("upcoming"),
  rsvpCount: integer("rsvp_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetupRsvpsTable = pgTable("meetup_rsvps", {
  id: serial("id").primaryKey(),
  meetupId: integer("meetup_id").notNull().references(() => meetupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.meetupId, t.userId)]);

export const insertMeetupSchema = createInsertSchema(meetupsTable).omit({ id: true, createdAt: true, rsvpCount: true, status: true });
export type InsertMeetup = z.infer<typeof insertMeetupSchema>;
export type Meetup = typeof meetupsTable.$inferSelect;
export type MeetupRsvp = typeof meetupRsvpsTable.$inferSelect;

export const personalsTable = pgTable("personals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  description: text("description").notNull(),
  age: integer("age"),
  gender: text("gender"),
  lookingFor: jsonb("looking_for").$type<string[]>().notNull().default([]),
  location: text("location"),
  photoUrl: text("photo_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Personal = typeof personalsTable.$inferSelect;
