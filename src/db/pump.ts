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

  for (const table of [
    schema.archivedUserOnRides,
    schema.archivedRides,
    schema.sessions,
    schema.accounts,
    schema.userOnRides,
    schema.rides,
    schema.repeatingRides,
    schema.users,
  ]) {
    // Intentionally deleting all rows for data migration
    await db.delete(table);
  }

  console.info("Data migration started");

  // Users
  const usersData = await sourceDb.execute(sql`select
    id, name, email, image, mobile, emergency, role, preferences,
    membership_id as "membershipId",
    membership_status as "membershipStatus"
  from "bcc_users"`);
  // @ts-expect-error - data typing
  await db.insert(schema.users).values(usersData);
  console.info("Users migrated", usersData.length);

  // Accounts
  const accountsData = await sourceDb.execute(sql`SELECT
    user_id as "userId", type, provider,
    provider_account_id as "providerAccountId",
    refresh_token, access_token, expires_at, token_type,
    scope, id_token, session_state
  from "bcc_accounts"`);
  // @ts-expect-error - data typing
  await db.insert(schema.accounts).values(accountsData);
  console.info("Accounts migrated", accountsData.length);

  // Sessions
  const sessionsData = await sourceDb.execute(sql`select
    user_id as "userId", session_token as "sessionToken", expires
  from "bcc_sessions" where expires > NOW()`);
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
    id, name, ride_group as "rideGroup", ride_date as "rideDate",
    destination, distance, meet_point as "meetPoint", route,
    leader, notes, ride_limit as "rideLimit", deleted, cancelled,
    schedule_id as "scheduleId", created_at as "createdAt",
    updated_at as "updatedAt"
  from "bcc_rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.rides).values(ridesData);
  console.info("Rides migrated", ridesData.length);

  // Users on rides
  const uorData = await sourceDb.execute(sql`SELECT
    user_id as "userId", ride_id as "rideId", notes,
    created_at as "createdAt"
  from "bcc_users_on_rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.userOnRides).values(uorData);
  console.info("Users on rides migrated", uorData.length);

  // Repeating rides
  const repeatingRidesData = await sourceDb.execute(sql`SELECT
    id, name, schedule, winter_start_time as "winterStartTime",
    ride_group as "rideGroup", destination, distance,
    meet_point as "meetPoint", route, leader, notes,
    ride_limit as "rideLimit", created_at as "createdAt"
  from "bcc_repeating_rides"`);
  // @ts-expect-error - data typing
  await db.insert(schema.repeatingRides).values(repeatingRidesData);
  console.info("Repeating rides migrated", repeatingRidesData.length);

  // Archived Rides
  const archivedRidesData = await sourceDb.execute(sql`SELECT
    id, name, ride_group as "rideGroup", ride_date as "rideDate",
    destination, distance, meet_point as "meetPoint", route,
    leader, notes, ride_limit as "rideLimit", deleted, cancelled,
    created_at as "createdAt"
  from "bcc_archived_rides"`);
  if (archivedRidesData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.archivedRides).values(archivedRidesData);
  }
  console.info("Archived rides migrated", archivedRidesData.length);

  // Archived users on rides
  const archivedUorData = await sourceDb.execute(sql`SELECT
    user_id as "userId", ride_id as "rideId", notes,
    created_at as "createdAt"
  from "bcc_archived_users_on_rides"`);
  if (archivedUorData.length > 0) {
    // @ts-expect-error - data typing
    await db.insert(schema.archivedUserOnRides).values(archivedUorData);
  }
  console.info("Archived users on rides migrated", archivedUorData.length);

  console.info("Data migration done");
  process.exit(0);
};

void main();
