import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";
import * as seeds from "./seeds/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found in environment");
}

if (!process.env.DB_SEEDING) {
  throw new Error('You must set DB_SEEDING to "true" when running seeds');
}

const main = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const db = drizzle(process.env.DATABASE_URL, {
    schema,
    casing: "snake_case",
  });

  console.info("Cleaning tables");

  for (const table of [
    schema.sessions,
    schema.accounts,
    schema.userOnRides,
    schema.rides,
    schema.repeatingRides,
    schema.users,
  ]) {
    // Intentionally deleting all rows for seeding
    await db.delete(table);
  }

  console.info("Seeding started");

  await seeds.users(db);
  await seeds.sessions(db);
  await seeds.accounts(db);
  await seeds.rides(db);
  await seeds.usersOnRides(db);

  console.info("Seeding done");
  process.exit(0);
};

void main();
