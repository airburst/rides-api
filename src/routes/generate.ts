import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { accounts, repeatingRides, rides } from "../db/schema/index.js";
import { verifyAuth0Token } from "../lib/auth0.js";
import {
  makeRidesInPeriod,
  updateRRuleStartDate,
  type RepeatingRideDb,
  type RideSet,
} from "../lib/rrule-utils.js";

export const generateRouter = new Hono();

interface GenerateResult {
  scheduleId?: string;
  count?: number;
  error?: string;
}

// Helper to create rides from a RideSet
const createRidesFromSet = async ({
  id,
  rides: rideList,
  schedule,
}: RideSet): Promise<GenerateResult> => {
  if (rideList.length === 0) {
    return { scheduleId: id, count: 0 };
  }

  try {
    // Insert all rides
    const insertData = rideList.map((ride) => ({
      id: crypto.randomUUID(),
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

    await db.insert(rides).values(insertData);

    // Update the repeating ride schedule start date
    const lastDate = rideList.at(-1)?.rideDate;
    const updatedSchedule = updateRRuleStartDate(schedule, lastDate);

    if (id) {
      await db
        .update(repeatingRides)
        .set({ schedule: updatedSchedule, updatedAt: new Date().toISOString() })
        .where(eq(repeatingRides.id, id));
    }

    return { scheduleId: id, count: rideList.length };
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
      // Must be ADMIN - users is always present due to foreign key
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (account?.users?.role === "ADMIN") {
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
        templates.push(template as RepeatingRideDb);
      }
    } else {
      // All templates
      const allTemplates = await db.query.repeatingRides.findMany();
      templates = allTemplates as RepeatingRideDb[];
    }

    // Generate ride sets from templates
    const rideSets = templates.map((template) =>
      makeRidesInPeriod(template, generateFromDate),
    );

    // Create rides sequentially
    const results: GenerateResult[] = [];
    for (const rideSet of rideSets) {
      const result = await createRidesFromSet(rideSet);
      results.push(result);
    }

    const totalErrors = results.filter((r) => r.error).length;

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
