import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  max_lifetime: 1800,
});
export const db = drizzle(client, { schema, casing: "snake_case" });
export { client as sqlClient };

export type Db = typeof db;
