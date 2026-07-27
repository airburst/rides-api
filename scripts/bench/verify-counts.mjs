import { Database } from "bun:sqlite";
import postgres from "postgres";

const sqlitePath =
  process.env.SQLITE_DB_PATH ?? "./data/rides-candidate.sqlite";
const postgresUrl = process.env.DATABASE_URL;

if (!postgresUrl) {
  throw new Error("DATABASE_URL is required to verify counts against Postgres");
}

const tables = [
  "clubs",
  "users",
  "user_clubs",
  "accounts",
  "rides",
  "users_on_rides",
];

function formatRow(table, pgCount, sqliteCount) {
  const match = pgCount === sqliteCount ? "yes" : "no";
  return `${table.padEnd(16)} pg=${String(pgCount).padStart(6)} sqlite=${String(
    sqliteCount,
  ).padStart(6)} match=${match}`;
}

async function main() {
  const pg = postgres(postgresUrl);
  const sqlite = new Database(sqlitePath, { readonly: true });

  try {
    console.info(`Comparing row counts:`);
    console.info(`  Postgres: ${postgresUrl}`);
    console.info(`  SQLite:   ${sqlitePath}`);

    let mismatches = 0;

    for (const table of tables) {
      const pgRows = await pg.unsafe(
        `select count(*)::int as count from ${table}`,
      );
      const sqliteRows = sqlite
        .query(`select count(*) as count from ${table}`)
        .get();

      const pgCount = Number(pgRows[0]?.count ?? 0);
      const sqliteCount = Number(sqliteRows?.count ?? 0);
      if (pgCount !== sqliteCount) mismatches += 1;

      console.info(formatRow(table, pgCount, sqliteCount));
    }

    console.info(`Mismatched tables: ${mismatches}`);
    if (mismatches > 0) {
      process.exitCode = 2;
    }
  } finally {
    await pg.end();
    sqlite.close();
  }
}

void main();
