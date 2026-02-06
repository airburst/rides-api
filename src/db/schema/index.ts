import { relations, sql } from "drizzle-orm";
import * as t from "drizzle-orm/pg-core";
import { pgTableCreator } from "drizzle-orm/pg-core";

// Table prefix
const createTable = pgTableCreator((name) => `bcc_${name}`);

// Enums
export const roleEnum = t.pgEnum("role", ["USER", "LEADER", "ADMIN"]);

// ============ TABLES ============

export const users = createTable(
  "users",
  {
    id: t.text().primaryKey(),
    name: t.varchar({ length: 255 }),
    email: t.varchar({ length: 255 }).notNull(),
    emailVerified: t.timestamp({ precision: 3, withTimezone: true }),
    image: t.text(),
    mobile: t.varchar({ length: 255 }),
    emergency: t.varchar({ length: 255 }),
    role: roleEnum().default("USER"),
    preferences: t.json().default({ units: "km" }),
    membershipId: t.text(),
    membershipStatus: t.varchar({ length: 255 }).default("NOT_MEMBER"),
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
    t.index("idx_users_name_lower").on(sql`lower(${table.name})`),
    t.index("idx_users_email_lower").on(sql`lower(${table.email})`),
  ],
);

export const accounts = createTable(
  "accounts",
  {
    userId: t
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    type: t.varchar({ length: 255 }).notNull(),
    provider: t.varchar({ length: 255 }).notNull(),
    providerAccountId: t.varchar({ length: 255 }).notNull(),
    refresh_token: t.text(),
    access_token: t.text(),
    expires_at: t.integer(),
    token_type: t.varchar({ length: 255 }),
    scope: t.varchar({ length: 255 }),
    id_token: t.text(),
    session_state: t.varchar({ length: 255 }),
  },
  (table) => [
    t.primaryKey({ columns: [table.provider, table.providerAccountId] }),
    t.index("account_userId_idx").on(table.userId),
  ],
);

export const rides = createTable(
  "rides",
  {
    id: t.text().primaryKey(),
    name: t.varchar({ length: 255 }).notNull(),
    rideGroup: t.varchar({ length: 255 }),
    rideDate: t.timestamp({ precision: 3, mode: "string" }).notNull(),
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
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  users: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const rideRelations = relations(rides, ({ many }) => ({
  users: many(userOnRides),
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
  (table) => [t.index().on(table.name)],
);

export const repeatingRideRelations = relations(repeatingRides, ({ many }) => ({
  rides: many(rides),
}));

// Archived Rides (for historical data)
export const archivedRides = createTable(
  "archived_rides",
  {
    id: t.text().primaryKey(),
    name: t.varchar({ length: 255 }).notNull(),
    rideGroup: t.varchar({ length: 255 }),
    rideDate: t.timestamp({ precision: 3, mode: "string" }).notNull(),
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
  (table) => [t.index().on(table.name)],
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

// Memberships (from RiderHQ)
export const memberships = createTable("membership", {
  system: t.text().notNull().default("RiderHQ"),
  memberId: t.text().primaryKey().notNull(),
  userId: t.text().notNull(),
  handle: t.text().notNull(),
  isUser: t.boolean().notNull(),
  firstnames: t.text().notNull(),
  lastname: t.text().notNull(),
  email: t.text().notNull(),
  expires: t.text(),
  isVerified: t.boolean(),
  isGuest: t.boolean(),
});
