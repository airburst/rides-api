import type { Db } from "../index.js";
import { accounts } from "../schema/index.js";
import data from "./data/accounts.json" with { type: "json" };

export default async function seed(db: Db) {
  const rows = data.map(
    ({
      id,
      userId,
      provider,
      providerAccountId,
      access_token,
      id_token,
      scope,
    }) => ({
      id,
      userId,
      accountId: providerAccountId,
      providerId: provider,
      accessToken: access_token,
      idToken: id_token,
      scope: scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await db.insert(accounts).values(rows);
}
