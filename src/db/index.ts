import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";

const connectionString = env("DATABASE_URL");

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  max_lifetime: 1800,
});
export const db = drizzle(client, { schema, casing: "snake_case" });
export { client as sqlClient };

export type Db = typeof db;
