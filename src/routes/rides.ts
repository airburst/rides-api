import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { rides, userOnRides } from "../db/schema/index.js";
import {
  authMiddleware,
  optionalAuth,
  type AuthUser,
} from "../middleware/auth.js";

export const ridesRouter = new Hono<{ Variables: { user?: AuthUser } }>();

// GET /rides?start=2024-01-01&end=2024-12-31
ridesRouter.get("/", optionalAuth, async (c) => {
  const start = c.req.query("start") ?? new Date().toISOString().split("T")[0];
  const end = c.req.query("end") ?? "2099-12-31";

  try {
    const result = await db.query.rides.findMany({
      columns: {
        id: true,
        name: true,
        rideGroup: true,
        rideDate: true,
        destination: true,
        distance: true,
        rideLimit: true,
        cancelled: true,
        createdAt: true,
      },
      with: {
        users: {
          columns: { userId: true },
        },
      },
      where: and(
        lte(rides.rideDate, `${end}T23:59:59`),
        gte(rides.rideDate, start),
        eq(rides.deleted, false),
      ),
      orderBy: [asc(rides.rideDate), asc(rides.name), desc(rides.distance)],
    });

    return c.json({ rides: result });
  } catch (error) {
    console.error("Error fetching rides:", error);
    return c.json({ error: "Failed to fetch rides" }, 500);
  }
});

// GET /rides/:id
ridesRouter.get("/:id", optionalAuth, async (c) => {
  const id = c.req.param("id");

  try {
    const result = await db.query.rides.findFirst({
      with: {
        users: {
          columns: { notes: true, createdAt: true },
          with: { user: true },
          orderBy: (userOnRides, { asc }) => [asc(userOnRides.createdAt)],
        },
      },
      where: and(eq(rides.id, id), eq(rides.deleted, false)),
    });

    if (!result) {
      return c.json({ error: "Ride not found" }, 404);
    }

    return c.json({ ride: result });
  } catch (error) {
    console.error("Error fetching ride:", error);
    return c.json({ error: "Failed to fetch ride" }, 500);
  }
});

// POST /rides/:id/join
ridesRouter.post("/:id/join", authMiddleware, async (c) => {
  const rideId = c.req.param("id");
  const user = c.get("user");

  let body: { userId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // No body provided, use current user
  }

  // Users can join themselves, leaders can add others
  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(user.role);

  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    await db.insert(userOnRides).values({ rideId, userId: targetUserId });
    return c.json({ success: true });
  } catch (error) {
    console.error("Join error:", error);
    return c.json({ error: "Failed to join ride" }, 500);
  }
});

// POST /rides/:id/leave
ridesRouter.post("/:id/leave", authMiddleware, async (c) => {
  const rideId = c.req.param("id");
  const user = c.get("user");

  let body: { userId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // No body provided, use current user
  }

  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(user.role);

  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    await db
      .delete(userOnRides)
      .where(
        and(
          eq(userOnRides.rideId, rideId),
          eq(userOnRides.userId, targetUserId),
        ),
      );
    return c.json({ success: true });
  } catch (error) {
    console.error("Leave error:", error);
    return c.json({ error: "Failed to leave ride" }, 500);
  }
});

// PATCH /rides/:id/notes - Update user's notes for a ride
ridesRouter.patch("/:id/notes", authMiddleware, async (c) => {
  const rideId = c.req.param("id");
  const user = c.get("user");

  let body: { notes?: string; userId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(user.role);

  // Users can update their own notes, leaders/admins can update others
  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    await db
      .update(userOnRides)
      .set({ notes: body.notes ?? "" })
      .where(
        and(
          eq(userOnRides.rideId, rideId),
          eq(userOnRides.userId, targetUserId),
        ),
      );
    return c.json({ success: true });
  } catch (error) {
    console.error("Update notes error:", error);
    return c.json({ error: "Failed to update notes" }, 500);
  }
});
