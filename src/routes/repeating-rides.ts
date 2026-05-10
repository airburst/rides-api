import { and, asc, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { repeatingRides, rides } from "../db/schema/index.js";
import {
  optionalAuth,
  requireAuth,
  type AuthUser,
} from "../middleware/auth.js";
import {
  requireClubRole,
  resolveClub,
  type ClubContext,
} from "../middleware/club.js";

interface Vars { user?: AuthUser; club: ClubContext }

export const repeatingRidesRouter = new Hono<{ Variables: Vars }>();

repeatingRidesRouter.use("*", optionalAuth, resolveClub);

// Validation schema for repeating ride
const repeatingRideSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  schedule: z.string().min(1, "Schedule is required"),
  winterStartTime: z.string().optional().nullable(),
  rideGroup: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  distance: z.number().int().optional().nullable(),
  meetPoint: z.string().optional().nullable(),
  route: z.string().optional().nullable(),
  leader: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  rideLimit: z.number().int().optional(),
});

// GET /repeating-rides - List all repeating rides for this club (admin only)
repeatingRidesRouter.get(
  "/",
  requireAuth,
  requireClubRole("ADMIN"),
  async (c) => {
    const club = c.get("club");
    try {
      const result = await db.query.repeatingRides.findMany({
        where: eq(repeatingRides.clubId, club.id),
        orderBy: [asc(repeatingRides.name), desc(repeatingRides.distance)],
      });

      return c.json({ repeatingRides: result });
    } catch (error) {
      console.error("Error fetching repeating rides:", error);
      return c.json({ error: "Failed to fetch repeating rides" }, 500);
    }
  },
);

// GET /repeating-rides/:id (admin only)
repeatingRidesRouter.get(
  "/:id",
  requireAuth,
  requireClubRole("ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    try {
      const repeatingRide = await db.query.repeatingRides.findFirst({
        where: and(
          eq(repeatingRides.id, id),
          eq(repeatingRides.clubId, club.id),
        ),
      });

      if (!repeatingRide) {
        return c.json({ error: "Repeating ride not found" }, 404);
      }

      return c.json({ repeatingRide });
    } catch (error) {
      console.error("Error fetching repeating ride:", error);
      return c.json({ error: "Failed to fetch repeating ride" }, 500);
    }
  },
);

// POST /repeating-rides (admin only)
repeatingRidesRouter.post(
  "/",
  requireAuth,
  requireClubRole("ADMIN"),
  async (c) => {
    const club = c.get("club");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const result = repeatingRideSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: z.treeifyError(result.error) },
        400,
      );
    }

    const data = result.data;
    const id = crypto.randomUUID();

    try {
      await db.insert(repeatingRides).values({
        id,
        clubId: club.id,
        name: data.name,
        schedule: data.schedule,
        winterStartTime: data.winterStartTime,
        rideGroup: data.rideGroup,
        destination: data.destination,
        distance: data.distance,
        meetPoint: data.meetPoint,
        route: data.route,
        leader: data.leader,
        notes: data.notes,
        rideLimit: data.rideLimit ?? -1,
      });

      return c.json({ success: true, id }, 201);
    } catch (error) {
      console.error("Create repeating ride error:", error);
      return c.json({ error: "Failed to create repeating ride" }, 500);
    }
  },
);

// PUT /repeating-rides/:id (admin only)
repeatingRidesRouter.put(
  "/:id",
  requireAuth,
  requireClubRole("ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const result = repeatingRideSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: z.treeifyError(result.error) },
        400,
      );
    }

    const data = result.data;

    try {
      const existing = await db.query.repeatingRides.findFirst({
        where: and(
          eq(repeatingRides.id, id),
          eq(repeatingRides.clubId, club.id),
        ),
      });

      if (!existing) {
        return c.json({ error: "Repeating ride not found" }, 404);
      }

      await db
        .update(repeatingRides)
        .set({
          name: data.name,
          schedule: data.schedule,
          winterStartTime: data.winterStartTime,
          rideGroup: data.rideGroup,
          destination: data.destination,
          distance: data.distance,
          meetPoint: data.meetPoint,
          route: data.route,
          leader: data.leader,
          notes: data.notes,
          rideLimit: data.rideLimit ?? -1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(eq(repeatingRides.id, id), eq(repeatingRides.clubId, club.id)),
        );

      return c.json({ success: true, id });
    } catch (error) {
      console.error("Update repeating ride error:", error);
      return c.json({ error: "Failed to update repeating ride" }, 500);
    }
  },
);

// DELETE /repeating-rides/:id (admin only); ?cascade=true also soft-deletes future rides
repeatingRidesRouter.delete(
  "/:id",
  requireAuth,
  requireClubRole("ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");
    const cascade = c.req.query("cascade") === "true";

    try {
      const existing = await db.query.repeatingRides.findFirst({
        where: and(
          eq(repeatingRides.id, id),
          eq(repeatingRides.clubId, club.id),
        ),
      });

      if (!existing) {
        return c.json({ error: "Repeating ride not found" }, 404);
      }

      let deletedRideCount = 0;

      if (cascade) {
        const now = new Date().toISOString();
        const result = await db
          .update(rides)
          .set({ deleted: true })
          .where(
            and(
              eq(rides.clubId, club.id),
              eq(rides.scheduleId, id),
              gt(rides.rideDate, now),
            ),
          )
          .returning({ id: rides.id });
        deletedRideCount = result.length;
      }

      await db
        .delete(repeatingRides)
        .where(
          and(eq(repeatingRides.id, id), eq(repeatingRides.clubId, club.id)),
        );

      return c.json({ success: true, id, deletedRideCount });
    } catch (error) {
      console.error("Delete repeating ride error:", error);
      return c.json({ error: "Failed to delete repeating ride" }, 500);
    }
  },
);
