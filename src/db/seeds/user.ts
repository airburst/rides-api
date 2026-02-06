import type { Db } from "../index.js";
import { users } from "../schema/index.js";
import userData from "./data/users.json" with { type: "json" };

export default async function seed(db: Db) {
  await db.insert(users).values(userData as (typeof users.$inferInsert)[]);
}
