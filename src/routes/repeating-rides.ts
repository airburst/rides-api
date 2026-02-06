import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { repeatingRides } from "../db/schema/index.js";
import { authMiddleware, requireRole, type AuthUser } from "../middleware/auth.js";

export const repeatingRidesRouter = new Hono<{ Variables: { user: AuthUser } }>();

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

// GET /repeating-rides - List all repeating rides (admin only)
repeatingRidesRouter.get("/", authMiddleware, requireRole("ADMIN"), async (c) => {
  try {
    const result = await db.query.repeatingRides.findMany({
      orderBy: [asc(repeatingRides.name), desc(repeatingRides.distance)],
    });

    return c.json({ repeatingRides: result });
  } catch (error) {
    console.error("Error fetching repeating rides:", error);
    return c.json({ error: "Failed to fetch repeating rides" }, 500);
  }
});

// GET /repeating-rides/:id - Get a specific repeating ride (admin only)
repeatingRidesRouter.get("/:id", authMiddleware, requireRole("ADMIN"), async (c) => {
  const id = c.req.param("id");

  try {
    const repeatingRide = await db.query.repeatingRides.findFirst({
      where: eq(repeatingRides.id, id),
    });

    if (!repeatingRide) {
      return c.json({ error: "Repeating ride not found" }, 404);
    }

    return c.json({ repeatingRide });
  } catch (error) {
    console.error("Error fetching repeating ride:", error);
    return c.json({ error: "Failed to fetch repeating ride" }, 500);
  }
});

// POST /repeating-rides - Create a new repeating ride (admin only)
repeatingRidesRouter.post("/", authMiddleware, requireRole("ADMIN"), async (c) => {
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
});

// PUT /repeating-rides/:id - Update a repeating ride (admin only)
repeatingRidesRouter.put("/:id", authMiddleware, requireRole("ADMIN"), async (c) => {
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
      where: eq(repeatingRides.id, id),
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
      .where(eq(repeatingRides.id, id));

    return c.json({ success: true, id });
  } catch (error) {
    console.error("Update repeating ride error:", error);
    return c.json({ error: "Failed to update repeating ride" }, 500);
  }
});

// DELETE /repeating-rides/:id - Delete a repeating ride (admin only)
repeatingRidesRouter.delete("/:id", authMiddleware, requireRole("ADMIN"), async (c) => {
  const id = c.req.param("id");

  try {
    const existing = await db.query.repeatingRides.findFirst({
      where: eq(repeatingRides.id, id),
    });

    if (!existing) {
      return c.json({ error: "Repeating ride not found" }, 404);
    }

    await db.delete(repeatingRides).where(eq(repeatingRides.id, id));

    return c.json({ success: true, id });
  } catch (error) {
    console.error("Delete repeating ride error:", error);
    return c.json({ error: "Failed to delete repeating ride" }, 500);
  }
});
