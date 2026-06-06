import { relations, sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { pgTableCreator } from "drizzle-orm/pg-core";

const createTable = pgTableCreator((name) => name);

// Enums
export const roleEnum = t.pgEnum("role", ["USER", "LEADER", "ADMIN"]);

// Type exports
export type Role = (typeof roleEnum.enumValues)[number];

// ============ TABLES ============

export const clubs = createTable(
  "clubs",
  {
    id: t.uuid().primaryKey().defaultRandom(),
    slug: t.varchar({ length: 30 }).notNull(),
    name: t.varchar({ length: 255 }).notNull(),
    settings: t.jsonb().default({}).notNull(),
    allowedOrigins: t.jsonb().default([]).notNull(),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  () => [],
);

export const users = createTable(
  "users",
  {
    id: t.text().primaryKey(),
    name: t.varchar({ length: 255 }),
    email: t.varchar({ length: 255 }).notNull(),
    emailVerified: t.boolean().default(false),
    image: t.text(),
    imageLarge: t.text(),
    mobile: t.varchar({ length: 255 }),
    emergency: t.varchar({ length: 255 }),
    isSuperAdmin: t.boolean().notNull().default(false),
    preferences: t.json().default({ units: "km" }),
    membershipId: t.text(),
    membershipStatus: t.varchar({ length: 255 }).default("NOT_MEMBER"),
    lastLoginAt: t.timestamp({ precision: 3, mode: "date" }),
    createdAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.index("idx_users_name_lower").on(sql`lower(${table.name})`),
    t.index("idx_users_email_lower").on(sql`lower(${table.email})`),
  ],
);

export const userClubs = createTable(
  "user_clubs",
  {
    userId: t
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clubId: t
      .uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    role: roleEnum().notNull().default("USER"),
    joinedAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.primaryKey({ columns: [table.userId, table.clubId] }),
    t.index("idx_user_clubs_club_id").on(table.clubId),
  ],
);

export const clubApiKeys = createTable(
  "club_api_keys",
  {
    id: t.text().primaryKey(),
    clubId: t.uuid().references(() => clubs.id, { onDelete: "cascade" }),
    hashedKey: t.text().notNull(),
    label: t.varchar({ length: 255 }),
    lastUsedAt: t.timestamp({ precision: 3, mode: "string" }),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.uniqueIndex("club_api_keys_hashed_key_unique").on(table.hashedKey),
  ],
);

export const accounts = createTable(
  "accounts",
  {
    id: t.text().primaryKey(),
    accountId: t.text().notNull(),
    providerId: t.text().notNull(),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    password: t.text(),
    accessToken: t.text(),
    refreshToken: t.text(),
    idToken: t.text(),
    accessTokenExpiresAt: t.timestamp({ precision: 3, mode: "date" }),
    refreshTokenExpiresAt: t.timestamp({ precision: 3, mode: "date" }),
    scope: t.text(),
    createdAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.index("account_user_id_idx").on(table.userId),
    t.index("accounts_account_id_idx").on(table.accountId),
  ],
);

export const rides = createTable(
  "rides",
  {
    id: t.text().primaryKey(),
    clubId: t
      .uuid()
      .notNull()
      .references(() => clubs.id),
    name: t.varchar({ length: 255 }).notNull(),
    rideGroup: t.varchar({ length: 255 }),
    rideDate: t
      .timestamp({ precision: 3, withTimezone: true, mode: "string" })
      .notNull(),
    destination: t.varchar({ length: 255 }),
    distance: t.integer(),
    meetPoint: t.varchar({ length: 255 }),
    route: t.varchar({ length: 255 }),
    leader: t.varchar({ length: 255 }),
    notes: t.text(),
    rideLimit: t.integer().notNull().default(-1),
    deleted: t.boolean().notNull().default(false),
    cancelled: t.boolean().notNull().default(false),
    scheduleId: t.text(),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.index().on(table.name),
    t.index("idx_rides_date_deleted").on(table.rideDate, table.deleted),
    t.index("idx_rides_schedule_date").on(table.scheduleId, table.rideDate),
    t
      .index("idx_rides_club_deleted_date")
      .on(table.clubId, table.deleted, table.rideDate),
  ],
);

export const userOnRides = createTable(
  "users_on_rides",
  {
    userId: t
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    rideId: t
      .varchar({ length: 255 })
      .notNull()
      .references(() => rides.id),
    notes: t.text(),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.primaryKey({ columns: [table.userId, table.rideId] }),
    t
      .index("idx_users_on_rides_ride_created")
      .on(table.rideId, table.createdAt),
  ],
);

// ============ RELATIONS ============

export const userRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  rides: many(userOnRides),
  clubs: many(userClubs),
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  users: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const clubRelations = relations(clubs, ({ many }) => ({
  members: many(userClubs),
  rides: many(rides),
  repeatingRides: many(repeatingRides),
}));

export const userClubRelations = relations(userClubs, ({ one }) => ({
  user: one(users, { fields: [userClubs.userId], references: [users.id] }),
  club: one(clubs, { fields: [userClubs.clubId], references: [clubs.id] }),
}));

export const rideRelations = relations(rides, ({ one, many }) => ({
  users: many(userOnRides),
  club: one(clubs, { fields: [rides.clubId], references: [clubs.id] }),
}));

export const userOnRidesRelations = relations(userOnRides, ({ one }) => ({
  user: one(users, { fields: [userOnRides.userId], references: [users.id] }),
  ride: one(rides, { fields: [userOnRides.rideId], references: [rides.id] }),
}));

// Repeating Rides
export const repeatingRides = createTable(
  "repeating_rides",
  {
    id: t.text().primaryKey(),
    clubId: t
      .uuid()
      .notNull()
      .references(() => clubs.id),
    name: t.varchar({ length: 255 }).notNull(),
    schedule: t.text().notNull(),
    winterStartTime: t.varchar({ length: 255 }),
    rideGroup: t.varchar({ length: 255 }),
    destination: t.varchar({ length: 255 }),
    distance: t.integer(),
    meetPoint: t.varchar({ length: 255 }),
    route: t.varchar({ length: 255 }),
    leader: t.varchar({ length: 255 }),
    notes: t.text(),
    rideLimit: t.integer().default(-1).notNull(),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.index().on(table.name),
    t.index("idx_repeating_rides_club_id").on(table.clubId),
  ],
);

export const repeatingRideRelations = relations(repeatingRides, ({ many }) => ({
  rides: many(rides),
}));

// Archived Rides (for historical data)
export const archivedRides = createTable(
  "archived_rides",
  {
    id: t.text().primaryKey(),
    clubId: t
      .uuid()
      .notNull()
      .references(() => clubs.id),
    name: t.varchar({ length: 255 }).notNull(),
    rideGroup: t.varchar({ length: 255 }),
    rideDate: t
      .timestamp({ precision: 3, withTimezone: true, mode: "string" })
      .notNull(),
    destination: t.varchar({ length: 255 }),
    distance: t.integer(),
    meetPoint: t.varchar({ length: 255 }),
    route: t.varchar({ length: 255 }),
    leader: t.varchar({ length: 255 }),
    notes: t.text(),
    rideLimit: t.integer().notNull().default(-1),
    deleted: t.boolean().notNull().default(false),
    cancelled: t.boolean().notNull().default(false),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    t.index().on(table.name),
    t.index("idx_archived_rides_club_id").on(table.clubId),
  ],
);

export const archivedUserOnRides = createTable(
  "archived_users_on_rides",
  {
    userId: t.varchar({ length: 255 }).notNull(),
    rideId: t.varchar({ length: 255 }).notNull(),
    notes: t.text(),
    createdAt: t
      .timestamp({ precision: 3, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [t.primaryKey({ columns: [table.userId, table.rideId] })],
);

// Memberships (from RiderHQ — currently BCC-only)
export const memberships = createTable(
  "memberships",
  {
    system: t.text().notNull().default("RiderHQ"),
    memberId: t.text().primaryKey().notNull(),
    clubId: t
      .uuid()
      .notNull()
      .references(() => clubs.id),
    userId: t.text().notNull(),
    handle: t.text().notNull(),
    isUser: t.boolean().notNull(),
    firstnames: t.text().notNull(),
    lastname: t.text().notNull(),
    email: t.text().notNull(),
    expires: t.text(),
    isVerified: t.boolean(),
    isGuest: t.boolean(),
  },
  (table) => [t.index("idx_memberships_club_id").on(table.clubId)],
);

// Sessions (better-auth)
export const sessions = createTable(
  "sessions",
  {
    id: t.text().primaryKey(),
    expiresAt: t.timestamp({ precision: 3, mode: "date" }).notNull(),
    token: t.text().notNull().unique(),
    createdAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    ipAddress: t.text(),
    userAgent: t.text(),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [t.index("session_user_id_idx").on(table.userId)],
);

export const sessionRelations = relations(sessions, ({ one }) => ({
  users: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// Verification (better-auth)
export const verification = createTable("verification", {
  id: t.text().primaryKey(),
  identifier: t.text().notNull(),
  value: t.text().notNull(),
  expiresAt: t.timestamp({ precision: 3, mode: "date" }).notNull(),
  createdAt: t.timestamp({ precision: 3, mode: "date" }),
  updatedAt: t.timestamp({ precision: 3, mode: "date" }),
});
