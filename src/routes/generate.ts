import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { accounts, repeatingRides, rides } from "../db/schema/index.js";
import { verifyAuth0Token } from "../lib/auth0.js";
import { cacheInvalidatePattern } from "../lib/cache.js";
import {
  filterExistingRides,
  makeRidesInPeriod,
  type RepeatingRideDb,
  type RideSet,
} from "../lib/rrule-utils.js";

export const generateRouter = new Hono();

interface GenerateResult {
  scheduleId?: string;
  count?: number;
  error?: string;
}

// Helper to create rides from a RideSet.
//
// Idempotent: a ride is uniquely identified by (scheduleId, rideDate). Any
// occurrence that already exists for this schedule — including soft-deleted ones,
// so a deliberately-removed ride is never resurrected — is skipped. Running
// /generate repeatedly (cron + manual, overlapping windows) therefore never
// creates duplicates. The check + insert run in one transaction.
const createRidesFromSet = async (
  { id, rides: rideList }: RideSet,
  clubId: string,
): Promise<GenerateResult> => {
  if (rideList.length === 0) {
    return { scheduleId: id, count: 0 };
  }

  try {
    return await db.transaction(async (tx) => {
      // Find which candidate occurrences already exist for this schedule.
      // NOTE: intentionally NOT filtered by `deleted` — a soft-deleted ride
      // still counts as "exists" so we never resurrect a deliberately-removed
      // occurrence. Scoped to clubId per tenancy rules.
      const candidateDates = rideList.map((r) => r.rideDate);
      const existing = id
        ? await tx
            .select({ rideDate: rides.rideDate })
            .from(rides)
            .where(
              and(
                eq(rides.clubId, clubId),
                eq(rides.scheduleId, id),
                inArray(rides.rideDate, candidateDates),
              ),
            )
        : [];

      const newRides = filterExistingRides(
        rideList,
        existing.map((e) => e.rideDate),
      );

      if (newRides.length === 0) {
        return { scheduleId: id, count: 0 };
      }

      const insertData = newRides.map((ride) => ({
        id: crypto.randomUUID(),
        clubId,
        name: ride.name,
        rideDate: ride.rideDate,
        rideGroup: ride.rideGroup,
        destination: ride.destination,
        distance: ride.distance,
        meetPoint: ride.meetPoint,
        route: ride.route,
        leader: ride.leader,
        notes: ride.notes,
        rideLimit: ride.rideLimit ?? -1,
        scheduleId: ride.scheduleId,
      }));

      await tx.insert(rides).values(insertData);

      return { scheduleId: id, count: newRides.length };
    });
  } catch (error) {
    console.error("Error creating rides:", error);
    return { scheduleId: id, error: "Failed to create rides" };
  }
};

// POST /generate - Generate rides from repeating ride templates
// Auth: API_KEY (for cron jobs) or user JWT with ADMIN role (for client)
generateRouter.post("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = process.env.API_KEY;

  // Check for API key auth (cron jobs)
  const isApiKeyAuth = authHeader === `Bearer ${apiKey}`;

  // Check for user auth (client)
  let isUserAuth = false;
  let hasValidToken = false;
  if (!isApiKeyAuth && authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = await verifyAuth0Token(token);

      // Look up user
      const account = await db.query.accounts.findFirst({
        where: eq(accounts.providerAccountId, payload.sub),
        with: { users: true },
      });

      hasValidToken = true;
      // Super-admin only
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (account?.users?.isSuperAdmin === true) {
        isUserAuth = true;
      }
    } catch {
      // Invalid token
    }
  }

  if (!isApiKeyAuth && !isUserAuth) {
    // If we have a valid token but not admin, return 403
    if (hasValidToken) {
      return c.json({ success: false, message: "Forbidden" }, 403);
    }
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  let body: { scheduleId?: string; date?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { scheduleId, date } = body;

  // Get next month if no date provided
  const generateFromDate =
    date ??
    (() => {
      const now = new Date();
      now.setMonth(now.getMonth() + 1);
      now.setDate(1);
      return now.toISOString();
    })();

  try {
    // Get templates
    let templates: RepeatingRideDb[] = [];

    if (scheduleId) {
      // Single template
      const template = await db.query.repeatingRides.findFirst({
        where: eq(repeatingRides.id, scheduleId),
      });
      if (template) {
        templates.push(template);
      }
    } else {
      // All templates
      const allTemplates = await db.query.repeatingRides.findMany();
      templates = allTemplates;
    }

    // Generate ride sets from templates, paired with their club.
    // Skip orphan templates (clubId nullable during phase 1 transition).
    const rideSets = templates.flatMap((template) => {
      if (!template.clubId) return [];
      return [
        {
          set: makeRidesInPeriod(template, generateFromDate),
          clubId: template.clubId,
        },
      ];
    });

    // Create rides sequentially
    const results: GenerateResult[] = [];
    for (const { set, clubId } of rideSets) {
      const result = await createRidesFromSet(set, clubId);
      results.push(result);
    }

    const totalErrors = results.filter((r) => r.error).length;

    // Invalidate all ride caches (bulk operation created multiple rides)
    void cacheInvalidatePattern("rides:*");

    return c.json({
      success: totalErrors === 0,
      generateFromDate,
      results,
    });
  } catch (error) {
    console.error("Generate rides error:", error);
    return c.json({ success: false, error: "Failed to generate rides" }, 500);
  }
});
