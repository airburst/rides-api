import type { Db } from "../index.js";
import { accounts } from "../schema/index.js";
import data from "./data/accounts.json" with { type: "json" };

export default async function seed(db: Db) {
  await db.insert(accounts).values(data as (typeof accounts.$inferInsert)[]);
}
