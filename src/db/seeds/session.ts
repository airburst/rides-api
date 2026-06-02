import type { Db } from "../index.js";
import { sessions } from "../schema/index.js";
import data from "./data/session.json" with { type: "json" };

export default async function seed(db: Db) {
  const rows = data.map(({ id, userId, sessionToken, expires }) => ({
    id,
    userId,
    token: sessionToken,
    expiresAt: expires,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  await db.insert(sessions).values(rows);
}
