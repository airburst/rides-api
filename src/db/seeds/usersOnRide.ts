import type { Db } from "../index.js";
import { userOnRides } from "../schema/index.js";
import userRideData from "./data/usersOnRides.json" with { type: "json" };

export default async function seed(db: Db) {
  await db.insert(userOnRides).values(userRideData);
}
