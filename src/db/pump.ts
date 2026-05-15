import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

const main = async () => {
  const sourceUrl = process.env.SOURCE_URL;
  const dbUrl = process.env.DATABASE_URL;

  if (!sourceUrl) {
    console.error("SOURCE_URL environment variable is required");
    process.exit(1);
  }
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sourceDb = drizzle(sourceUrl, { schema, casing: "snake_case" });
  const db = drizzle(dbUrl, { schema, casing: "snake_case" });

  console.info("Cleaning tables");

  // FK-safe order: leaf rows first, parent rows last.
  for (const table of [
    schema.archivedUserOnRides,
    schema.archivedRides,
    schema.sessions,
    schema.accounts,
    schema.userOnRides,
    schema.rides,
    schema.repeatingRides,
    schema.userClubs,
    schema.users,
    schema.clubs,
  ]) {
    // Intentionally deleting all rows for data migration
    await db.delete(table);
  }

  console.info("Data migration started");

  // Clubs (must come before any FK-dependent rows)
  const clubsData = await sourceDb.execute(sql`select
    id, slug, name, settings,
    allowed_origins as "allowedOrigins",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "clubs"`);
  // @ts-expect-error - data typing
  await db.insert(schema.clubs).values(clubsData);
  console.info("Clubs migrated", clubsData.length);

  // Users (emailVerified intentionally omitted — Auth0 backfills it on sign-in,
  // and pulling a `withTimezone: true, mode: Date` column as a string would
  // break drizzle's value mapper.)
  const usersData = await sourceDb.execute(sql`select
    id, name, email,
    image,
    image_large as "imageLarge",
    mobile, emergency,
    is_super_admin as "isSuperAdmin",
    preferences,
    membership_id as "membershipId",
    membership_status as "membershipStatus"
  from "users"`);
  // @ts-expect-error - data typing
  await db.insert(schema.users).values(usersData);
  console.info("Users migrated", usersData.length);

  // User_clubs (memberships)
  const userClubsData = await sourceDb.execute(sql`select
    user_id as "userId",
    club_id as "clubId",
    role,
    joined_at as "joinedAt"
  from "user_clubs"`);
  if (userClubsData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.userClubs).values(userClubsData);
  }
  console.info("User clubs migrated", userClubsData.length);

  // Accounts
  const accountsData = await sourceDb.execute(sql`SELECT
    user_id as "userId", type, provider,
    provider_account_id as "providerAccountId",
    refresh_token, access_token, expires_at, token_type,
    scope, id_token, session_state
  from "accounts"`);
  // @ts-expect-error - data typing
  await db.insert(schema.accounts).values(accountsData);
  console.info("Accounts migrated", accountsData.length);

  // Sessions
  const sessionsData = await sourceDb.execute(sql`select
    user_id as "userId", session_token as "sessionToken", expires
  from "sessions" where expires > NOW()`);
  sessionsData.forEach((session) => {
    // @ts-expect-error - data typing
    session.expires = new Date(session.expires);
  });
  if (sessionsData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.sessions).values(sessionsData);
  }
  console.info("Sessions migrated", sessionsData.length);

  // Rides
  const ridesData = await sourceDb.execute(sql`SELECT
    id,
    club_id as "clubId",
    name, ride_group as "rideGroup", ride_date as "rideDate",
    destination, distance, meet_point as "meetPoint", route,
    leader, notes, ride_limit as "rideLimit", deleted, cancelled,
    schedule_id as "scheduleId", created_at as "createdAt",
    updated_at as "updatedAt"
  from "rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.rides).values(ridesData);
  console.info("Rides migrated", ridesData.length);

  // Users on rides
  const uorData = await sourceDb.execute(sql`SELECT
    user_id as "userId", ride_id as "rideId", notes,
    created_at as "createdAt"
  from "users_on_rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.userOnRides).values(uorData);
  console.info("Users on rides migrated", uorData.length);

  // Repeating rides
  const repeatingRidesData = await sourceDb.execute(sql`SELECT
    id,
    club_id as "clubId",
    name, schedule, winter_start_time as "winterStartTime",
    ride_group as "rideGroup", destination, distance,
    meet_point as "meetPoint", route, leader, notes,
    ride_limit as "rideLimit", created_at as "createdAt"
  from "repeating_rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.repeatingRides).values(repeatingRidesData);
  console.info("Repeating rides migrated", repeatingRidesData.length);

  // Archived Rides
  const archivedRidesData = await sourceDb.execute(sql`SELECT
    id,
    club_id as "clubId",
    name, ride_group as "rideGroup", ride_date as "rideDate",
    destination, distance, meet_point as "meetPoint", route,
    leader, notes, ride_limit as "rideLimit", deleted, cancelled,
    created_at as "createdAt"
  from "archived_rides"`);
  if (archivedRidesData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.archivedRides).values(archivedRidesData);
  }
  console.info("Archived rides migrated", archivedRidesData.length);

  // Archived users on rides
  const archivedUorData = await sourceDb.execute(sql`SELECT
    user_id as "userId", ride_id as "rideId", notes,
    created_at as "createdAt"
  from "archived_users_on_rides"`);
  if (archivedUorData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.archivedUserOnRides).values(archivedUorData);
  }
  console.info("Archived users on rides migrated", archivedUorData.length);

  console.info("Data migration done");
  process.exit(0);
};

void main();
