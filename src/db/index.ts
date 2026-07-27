import { Database } from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";
import { bootstrapSqliteSchema } from "./sqlite-bootstrap.js";

const dialect = env("DB_DIALECT");

type PostgresDb = ReturnType<typeof drizzlePostgres<typeof schema>>;

let pgClient: ReturnType<typeof postgres> | null = null;
let sqliteClient: Database | null = null;

if (dialect === "sqlite") {
  const sqlitePath = env("SQLITE_DB_PATH");
  mkdirSync(dirname(sqlitePath), { recursive: true });
  sqliteClient = new Database(sqlitePath, { create: true, strict: true });

  // Keep SQLite behavior explicit for parity and safety.
  sqliteClient.run("PRAGMA journal_mode = WAL;");
  sqliteClient.run("PRAGMA foreign_keys = ON;");
  sqliteClient.run("PRAGMA busy_timeout = 5000;");
  bootstrapSqliteSchema(sqliteClient);

  console.info(`[DB] Using SQLite at ${sqlitePath}`);
} else {
  const connectionString = env("DATABASE_URL");
  pgClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    max_lifetime: 1800,
  });
  console.info("[DB] Using Postgres");
}

const postgresDb = pgClient
  ? drizzlePostgres(pgClient, { schema, casing: "snake_case" })
  : null;
const sqliteDb = sqliteClient
  ? drizzleSqlite(sqliteClient, {
      schema: schema as never,
      casing: "snake_case",
    })
  : null;

// Keep exported type stable while runtime can switch dialect via env.
export const db = (postgresDb ?? sqliteDb) as unknown as PostgresDb;

export async function closeDbConnection(): Promise<void> {
  if (pgClient) {
    await pgClient.end();
    return;
  }

  if (sqliteClient) {
    sqliteClient.close();
  }
}

export type Db = typeof db;
