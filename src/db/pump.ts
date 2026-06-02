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

  const BCC_UUID = "5cfb9e03-db2d-4371-b795-8402879f01f9";

  // Clubs (must come before any FK-dependent rows)
  const clubsData = await sourceDb.execute(sql`select
    id, slug, name, settings,
    allowed_origins as "allowedOrigins",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "clubs"`);
  clubsData.forEach((row) => {
    if (row.id === "bcc") row.id = BCC_UUID;
  });
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
    userClubsData.forEach((row) => {
      if (row.clubId === "bcc") row.clubId = BCC_UUID;
    });
    // @ts-expect-error - data typing
    await db.insert(schema.userClubs).values(userClubsData);
  }
  console.info("User clubs migrated", userClubsData.length);

  // Accounts — transform old NextAuth shape to better-auth shape
  const accountsRaw = await sourceDb.execute(sql`SELECT
    user_id as "userId",
    provider as "providerId",
    provider_account_id as "accountId",
    refresh_token as "refreshToken",
    access_token as "accessToken",
    id_token as "idToken",
    scope
  from "accounts"`);
  if (accountsRaw.length > 0) {
    const now = new Date();
    const accountsData = accountsRaw.map((row) => ({
      id: crypto.randomUUID(),
      userId: row.userId,
      providerId: row.providerId,
      accountId: row.accountId,
      refreshToken: row.refreshToken ?? null,
      accessToken: row.accessToken ?? null,
      idToken: row.idToken ?? null,
      scope: row.scope ?? null,
      createdAt: now,
      updatedAt: now,
    }));
    // @ts-expect-error - data typing
    await db.insert(schema.accounts).values(accountsData);
  }
  console.info("Accounts migrated", accountsRaw.length);

  // Sessions — production sessions table is NextAuth-style (empty in practice);
  // skip rather than attempt schema transformation
  console.info("Sessions skipped (NextAuth sessions not compatible with better-auth shape)");

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
  ridesData.forEach((row) => {
    if (row.clubId === "bcc") row.clubId = BCC_UUID;
  });
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
  repeatingRidesData.forEach((row) => {
    if (row.clubId === "bcc") row.clubId = BCC_UUID;
  });
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
    archivedRidesData.forEach((row) => {
      if (row.clubId === "bcc") row.clubId = BCC_UUID;
    });
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
