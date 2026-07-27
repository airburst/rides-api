import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";
import { bootstrapSqliteSchema } from "./sqlite-bootstrap.js";

const BCC_UUID = "5cfb9e03-db2d-4371-b795-8402879f01f9";

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return null;
}

const main = async () => {
  const sourceUrl = env("SOURCE_URL");
  const sqlitePath = env("SQLITE_DB_PATH");

  const sourceDb = drizzlePostgres(sourceUrl, { schema, casing: "snake_case" });

  mkdirSync(dirname(sqlitePath), { recursive: true });
  const sqliteClient = new Database(sqlitePath, { create: true, strict: true });
  sqliteClient.run("PRAGMA journal_mode = WAL;");
  sqliteClient.run("PRAGMA foreign_keys = ON;");
  sqliteClient.run("PRAGMA busy_timeout = 5000;");
  bootstrapSqliteSchema(sqliteClient);

  const targetDb = drizzleSqlite(sqliteClient, {
    schema: schema as never,
    casing: "snake_case",
  });

  console.info("Cleaning SQLite benchmark subset tables");
  for (const statement of [
    "DELETE FROM users_on_rides",
    "DELETE FROM rides",
    "DELETE FROM accounts",
    "DELETE FROM user_clubs",
    "DELETE FROM users",
    "DELETE FROM clubs",
  ]) {
    sqliteClient.run(statement);
  }

  console.info(`Pumping data from SOURCE_URL into SQLite at ${sqlitePath}`);

  const clubsData = await sourceDb.execute(sql`select
    id,
    slug,
    name,
    settings,
    allowed_origins as "allowedOrigins",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "clubs"`);
  const normalizedClubs = clubsData.map((row) => ({
    ...row,
    id: row.id === "bcc" ? BCC_UUID : row.id,
    settings:
      typeof row.settings === "string"
        ? row.settings
        : JSON.stringify(row.settings ?? {}),
    allowedOrigins:
      typeof row.allowedOrigins === "string"
        ? row.allowedOrigins
        : JSON.stringify(row.allowedOrigins ?? []),
  }));
  // @ts-expect-error sqlite candidate bootstrap typing
  await targetDb.insert(schema.clubs).values(normalizedClubs);
  console.info("Clubs migrated", normalizedClubs.length);

  const usersData = await sourceDb.execute(sql`select
    id,
    name,
    email,
    email_verified as "emailVerified",
    image,
    image_large as "imageLarge",
    mobile,
    emergency,
    is_super_admin as "isSuperAdmin",
    preferences,
    membership_id as "membershipId",
    membership_status as "membershipStatus",
    last_login_at as "lastLoginAt",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "users"`);
  const normalizedUsers = usersData.map((row) => ({
    ...row,
    lastLoginAt: toDate(row.lastLoginAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    preferences:
      typeof row.preferences === "string"
        ? row.preferences
        : JSON.stringify(row.preferences ?? { units: "km" }),
  }));
  // @ts-expect-error sqlite candidate bootstrap typing
  await targetDb.insert(schema.users).values(normalizedUsers);
  console.info("Users migrated", normalizedUsers.length);

  const userClubsData = await sourceDb.execute(sql`select
    user_id as "userId",
    club_id as "clubId",
    role,
    joined_at as "joinedAt"
  from "user_clubs"`);
  const normalizedUserClubs = userClubsData.map((row) => ({
    ...row,
    clubId: row.clubId === "bcc" ? BCC_UUID : row.clubId,
  }));
  if (normalizedUserClubs.length > 0) {
    // @ts-expect-error sqlite candidate bootstrap typing
    await targetDb.insert(schema.userClubs).values(normalizedUserClubs);
  }
  console.info("User clubs migrated", normalizedUserClubs.length);

  const accountsData = await sourceDb.execute(sql`select
    id,
    account_id as "accountId",
    provider_id as "providerId",
    user_id as "userId",
    password,
    access_token as "accessToken",
    refresh_token as "refreshToken",
    id_token as "idToken",
    access_token_expires_at as "accessTokenExpiresAt",
    refresh_token_expires_at as "refreshTokenExpiresAt",
    scope,
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "accounts"`);
  const normalizedAccounts = accountsData.map((row) => ({
    ...row,
    accessTokenExpiresAt: toDate(row.accessTokenExpiresAt),
    refreshTokenExpiresAt: toDate(row.refreshTokenExpiresAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  }));
  if (normalizedAccounts.length > 0) {
    // @ts-expect-error sqlite candidate bootstrap typing
    await targetDb.insert(schema.accounts).values(normalizedAccounts);
  }
  console.info("Accounts migrated", normalizedAccounts.length);

  const ridesData = await sourceDb.execute(sql`select
    id,
    club_id as "clubId",
    name,
    ride_group as "rideGroup",
    ride_date as "rideDate",
    destination,
    distance,
    meet_point as "meetPoint",
    route,
    leader,
    notes,
    ride_limit as "rideLimit",
    deleted,
    cancelled,
    schedule_id as "scheduleId",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from "rides"`);
  const normalizedRides = ridesData.map((row) => ({
    ...row,
    clubId: row.clubId === "bcc" ? BCC_UUID : row.clubId,
  }));
  if (normalizedRides.length > 0) {
    // @ts-expect-error sqlite candidate bootstrap typing
    await targetDb.insert(schema.rides).values(normalizedRides);
  }
  console.info("Rides migrated", normalizedRides.length);

  const usersOnRidesData = await sourceDb.execute(sql`select
    user_id as "userId",
    ride_id as "rideId",
    notes,
    created_at as "createdAt"
  from "users_on_rides"`);
  if (usersOnRidesData.length > 0) {
    // @ts-expect-error sqlite candidate bootstrap typing
    await targetDb.insert(schema.userOnRides).values(usersOnRidesData);
  }
  console.info("Users on rides migrated", usersOnRidesData.length);

  sqliteClient.close();
  console.info("SQLite pump complete");
};

void main();
