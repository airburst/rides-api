import type { Db } from "../index.js";
import { sessions } from "../schema/index.js";
import data from "./data/session.json" with { type: "json" };

export default async function seed(db: Db) {
  const rows = data.map(({ id, userId, sessionToken, expires }) => ({
    id,
    userId,
    token: sessionToken,
    expiresAt: new Date(expires),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await db.insert(sessions).values(rows);
}
