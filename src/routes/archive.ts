import { eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
	archivedRides,
	archivedUserOnRides,
	rides,
	userOnRides,
} from "../db/schema/index.js";
import { cacheInvalidatePattern } from "../lib/cache.js";

export const archiveRouter = new Hono();

// POST /archive - Archive old rides (API_KEY auth for cron jobs)
archiveRouter.post("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = process.env.API_KEY;

  if (authHeader !== `Bearer ${apiKey}`) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  let body: { date?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const runDate = body.date
    ? new Date(body.date).toISOString()
    : new Date().toISOString();

  try {
    let movedRidesCount = 0;
    let movedRidersCount = 0;

    await db.transaction(async (tx) => {
      // Get rides to archive
      const ridesToArchive = await tx
        .select()
        .from(rides)
        .where(lt(rides.rideDate, runDate));

      // Get riders to archive
      const ridersToArchive = await tx
        .select({
          rideId: userOnRides.rideId,
          userId: userOnRides.userId,
          notes: userOnRides.notes,
          createdAt: userOnRides.createdAt,
        })
        .from(userOnRides)
        .innerJoin(rides, eq(userOnRides.rideId, rides.id))
        .where(lt(rides.rideDate, runDate));

      // Insert archived rides
      if (ridesToArchive.length > 0) {
        await tx.insert(archivedRides).values(ridesToArchive);
        movedRidesCount = ridesToArchive.length;
      }

      // Insert archived riders
      if (ridersToArchive.length > 0) {
        await tx.insert(archivedUserOnRides).values(ridersToArchive);
        movedRidersCount = ridersToArchive.length;
      }

      // Delete riders (raw SQL for date comparison)
      await tx.execute(
        sql`DELETE FROM "bcc_users_on_rides" WHERE "ride_id" IN (SELECT id FROM "bcc_rides" WHERE "ride_date" < TO_TIMESTAMP(${runDate}, 'YYYY-MM-DD'))`,
      );

      // Delete rides
      await tx.execute(
        sql`DELETE FROM "bcc_rides" WHERE "ride_date" < TO_TIMESTAMP(${runDate}, 'YYYY-MM-DD')`,
      );
    });

    // Invalidate all ride caches (bulk operation deleted multiple rides)
    void cacheInvalidatePattern("rides:*");

    return c.json({
      success: true,
      runDate,
      archiveResults: {
        movedRides: movedRidesCount,
        movedRiders: movedRidersCount,
      },
    });
  } catch (error) {
    console.error("Archive rides error:", error);
    return c.json({ success: false, error: "Failed to archive rides" }, 500);
  }
});
