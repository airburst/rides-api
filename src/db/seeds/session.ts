import type { Db } from "../index.js";
import { sessions } from "../schema/index.js";
import data from "./data/session.json" with { type: "json" };

export default async function seed(db: Db) {
  // Change date strings to Date objects
  const dataToInsert = data.map((session) => {
    const { expires, ...rest } = session;
    return {
      ...rest,
      expires: new Date(expires),
    };
  });

  await db.insert(sessions).values(dataToInsert);
}
