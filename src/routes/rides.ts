import { and, asc, desc, eq, gte, like, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { rides, userOnRides } from "../db/schema/index.js";
import {
  buildCacheKey,
  cacheGet,
  cacheInvalidate,
  cacheInvalidatePattern,
  cacheSet,
  clubCachePattern,
} from "../lib/cache.js";
import {
  getAuthUser,
  optionalAuth,
  requireAuth,
  type AuthUser,
} from "../middleware/auth.js";
import {
  requireClubRole,
  resolveClub,
  type ClubContext,
} from "../middleware/club.js";

// Validation schemas
const createRideSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  rideDate: z.iso.datetime({ message: "Invalid datetime format" }),
  distance: z.number().int().min(10, "Distance must be at least 10 km"),
  rideGroup: z.string().optional(),
  destination: z.string().optional(),
  meetPoint: z.string().optional(),
  route: z.string().optional(),
  leader: z.string().optional(),
  notes: z.string().optional(),
  rideLimit: z.number().int().default(-1),
  scheduleId: z.string().optional(),
});

const updateRideSchema = createRideSchema.partial();

interface Vars { user?: AuthUser; club: ClubContext }

export const ridesRouter = new Hono<{ Variables: Vars }>();

// Apply optional auth + club resolution to every route in this router
ridesRouter.use("*", optionalAuth, resolveClub);

// GET /rides?start=2024-01-01&end=2024-12-31&shortId=abc123
ridesRouter.get("/", async (c) => {
  const club = c.get("club");
  const shortId = c.req.query("shortId");

  // Handle short ID lookup - bypass date filtering and caching
  if (shortId) {
    try {
      const result = await db.query.rides.findFirst({
        with: {
          users: {
            columns: { notes: true, createdAt: true },
            with: { user: true },
            orderBy: (userOnRides, { asc }) => [asc(userOnRides.createdAt)],
          },
        },
        where: and(
          eq(rides.clubId, club.id),
          like(rides.id, `%${shortId}`),
          eq(rides.deleted, false),
        ),
      });

      if (!result) {
        return c.json({ error: "Ride not found" }, 404);
      }

      return c.json({ ride: result });
    } catch (error) {
      console.error("Error fetching ride by short ID:", error);
      return c.json({ error: "Failed to fetch ride" }, 500);
    }
  }

  // Normal date-based listing
  const start = c.req.query("start") ?? new Date().toISOString().split("T")[0];
  const end = c.req.query("end") ?? "2099-12-31";

  const cacheKey = buildCacheKey("list", club.id, {
    date: `${start}:${end}`,
    limit: 0,
    offset: 0,
  });

  try {
    const cached = await cacheGet<{ rides: unknown[] }>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

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
        eq(rides.clubId, club.id),
        lte(rides.rideDate, `${end}T23:59:59Z`),
        gte(rides.rideDate, `${start}T00:00:00Z`),
        eq(rides.deleted, false),
      ),
      orderBy: [asc(rides.rideDate), asc(rides.name), desc(rides.distance)],
    });

    const response = { rides: result };
    void cacheSet(cacheKey, response);
    return c.json(response);
  } catch (error) {
    console.error("Error fetching rides:", error);
    return c.json({ error: "Failed to fetch rides" }, 500);
  }
});

// GET /rides/:id
ridesRouter.get("/:id", async (c) => {
  const club = c.get("club");
  const id = c.req.param("id");

  const cacheKey = buildCacheKey("detail", club.id, { rideId: id });

  try {
    const cached = await cacheGet<{ ride: unknown }>(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const result = await db.query.rides.findFirst({
      with: {
        users: {
          columns: { notes: true, createdAt: true },
          with: { user: true },
          orderBy: (userOnRides, { asc }) => [asc(userOnRides.createdAt)],
        },
      },
      where: and(
        eq(rides.clubId, club.id),
        eq(rides.id, id),
        eq(rides.deleted, false),
      ),
    });

    if (!result) {
      return c.json({ error: "Ride not found" }, 404);
    }

    const response = { ride: result };
    void cacheSet(cacheKey, response);
    return c.json(response);
  } catch (error) {
    console.error("Error fetching ride:", error);
    return c.json({ error: "Failed to fetch ride" }, 500);
  }
});

// POST /rides/:id/join
ridesRouter.post("/:id/join", requireAuth, async (c) => {
  const club = c.get("club");
  const rideId = c.req.param("id");
  const user = getAuthUser(c);

  let body: { userId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // No body provided, use current user
  }

  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(club.role);

  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Confirm ride belongs to this club
  const ride = await db.query.rides.findFirst({
    where: and(eq(rides.id, rideId), eq(rides.clubId, club.id)),
  });
  if (!ride) {
    return c.json({ error: "Ride not found" }, 404);
  }

  try {
    await db.insert(userOnRides).values({ rideId, userId: targetUserId });

    void cacheInvalidate(buildCacheKey("detail", club.id, { rideId }));
    void cacheInvalidatePattern(clubCachePattern(club.id));

    return c.json({ success: true });
  } catch (error) {
    console.error("Join error:", error);
    return c.json({ error: "Failed to join ride" }, 500);
  }
});

// POST /rides/:id/leave
ridesRouter.post("/:id/leave", requireAuth, async (c) => {
  const club = c.get("club");
  const rideId = c.req.param("id");
  const user = getAuthUser(c);

  let body: { userId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // No body provided, use current user
  }

  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(club.role);

  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const ride = await db.query.rides.findFirst({
    where: and(eq(rides.id, rideId), eq(rides.clubId, club.id)),
  });
  if (!ride) {
    return c.json({ error: "Ride not found" }, 404);
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

    void cacheInvalidate(buildCacheKey("detail", club.id, { rideId }));
    void cacheInvalidatePattern(clubCachePattern(club.id));

    return c.json({ success: true });
  } catch (error) {
    console.error("Leave error:", error);
    return c.json({ error: "Failed to leave ride" }, 500);
  }
});

// PATCH /rides/:id/notes - Update user's notes for a ride
ridesRouter.patch("/:id/notes", requireAuth, async (c) => {
  const club = c.get("club");
  const rideId = c.req.param("id");
  const user = getAuthUser(c);

  let body: { notes?: string; userId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const targetUserId = body.userId ?? user.id;
  const isSelf = targetUserId === user.id;
  const isLeaderOrAdmin = ["LEADER", "ADMIN"].includes(club.role);

  if (!isSelf && !isLeaderOrAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const ride = await db.query.rides.findFirst({
    where: and(eq(rides.id, rideId), eq(rides.clubId, club.id)),
  });
  if (!ride) {
    return c.json({ error: "Ride not found" }, 404);
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

    void cacheInvalidate(buildCacheKey("detail", club.id, { rideId }));

    return c.json({ success: true });
  } catch (error) {
    console.error("Update notes error:", error);
    return c.json({ error: "Failed to update notes" }, 500);
  }
});

// POST /rides - Create a new ride (LEADER/ADMIN only)
ridesRouter.post(
  "/",
  requireAuth,
  requireClubRole("LEADER", "ADMIN"),
  async (c) => {
    const club = c.get("club");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const result = createRideSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: z.treeifyError(result.error) },
        400,
      );
    }

    const data = result.data;
    const id = crypto.randomUUID();

    try {
      await db.insert(rides).values({
        id,
        clubId: club.id,
        name: data.name,
        rideDate: data.rideDate,
        distance: data.distance,
        rideGroup: data.rideGroup ?? null,
        destination: data.destination ?? null,
        meetPoint: data.meetPoint ?? null,
        route: data.route ?? null,
        leader: data.leader ?? null,
        notes: data.notes ?? null,
        rideLimit: data.rideLimit,
        scheduleId: data.scheduleId ?? null,
      });

      void cacheInvalidatePattern(clubCachePattern(club.id));

      return c.json({ success: true, id }, 201);
    } catch (error) {
      console.error("Create ride error:", error);
      return c.json({ error: "Failed to create ride" }, 500);
    }
  },
);

// PUT /rides/:id - Update a ride (LEADER/ADMIN only)
ridesRouter.put(
  "/:id",
  requireAuth,
  requireClubRole("LEADER", "ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const result = updateRideSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: z.treeifyError(result.error) },
        400,
      );
    }

    const existing = await db.query.rides.findFirst({
      where: and(
        eq(rides.id, id),
        eq(rides.clubId, club.id),
        eq(rides.deleted, false),
      ),
    });

    if (!existing) {
      return c.json({ error: "Ride not found" }, 404);
    }

    const data = result.data;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.rideDate !== undefined) updateData.rideDate = data.rideDate;
    if (data.distance !== undefined) updateData.distance = data.distance;
    if (data.rideGroup !== undefined)
      updateData.rideGroup = data.rideGroup || null;
    if (data.destination !== undefined)
      updateData.destination = data.destination || null;
    if (data.meetPoint !== undefined)
      updateData.meetPoint = data.meetPoint || null;
    if (data.route !== undefined) updateData.route = data.route || null;
    if (data.leader !== undefined) updateData.leader = data.leader || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.rideLimit !== undefined) updateData.rideLimit = data.rideLimit;
    if (data.scheduleId !== undefined)
      updateData.scheduleId = data.scheduleId || null;

    try {
      await db
        .update(rides)
        .set(updateData)
        .where(and(eq(rides.id, id), eq(rides.clubId, club.id)));

      void cacheInvalidate(buildCacheKey("detail", club.id, { rideId: id }));
      void cacheInvalidatePattern(clubCachePattern(club.id));

      return c.json({ success: true, id });
    } catch (error) {
      console.error("Update ride error:", error);
      return c.json({ error: "Failed to update ride" }, 500);
    }
  },
);

// DELETE /rides/:id - Soft delete a ride (LEADER/ADMIN only)
ridesRouter.delete(
  "/:id",
  requireAuth,
  requireClubRole("LEADER", "ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    const existing = await db.query.rides.findFirst({
      where: and(
        eq(rides.id, id),
        eq(rides.clubId, club.id),
        eq(rides.deleted, false),
      ),
    });

    if (!existing) {
      return c.json({ error: "Ride not found" }, 404);
    }

    try {
      await db
        .update(rides)
        .set({ deleted: true, updatedAt: new Date().toISOString() })
        .where(and(eq(rides.id, id), eq(rides.clubId, club.id)));

      void cacheInvalidate(buildCacheKey("detail", club.id, { rideId: id }));
      void cacheInvalidatePattern(clubCachePattern(club.id));

      return c.json({ success: true });
    } catch (error) {
      console.error("Delete ride error:", error);
      return c.json({ error: "Failed to delete ride" }, 500);
    }
  },
);

// POST /rides/:id/cancel - Cancel a ride (LEADER/ADMIN only)
ridesRouter.post(
  "/:id/cancel",
  requireAuth,
  requireClubRole("LEADER", "ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    const existing = await db.query.rides.findFirst({
      where: and(
        eq(rides.id, id),
        eq(rides.clubId, club.id),
        eq(rides.deleted, false),
      ),
    });

    if (!existing) {
      return c.json({ error: "Ride not found" }, 404);
    }

    try {
      await db
        .update(rides)
        .set({ cancelled: true, updatedAt: new Date().toISOString() })
        .where(and(eq(rides.id, id), eq(rides.clubId, club.id)));

      void cacheInvalidate(buildCacheKey("detail", club.id, { rideId: id }));
      void cacheInvalidatePattern(clubCachePattern(club.id));

      return c.json({ success: true });
    } catch (error) {
      console.error("Cancel ride error:", error);
      return c.json({ error: "Failed to cancel ride" }, 500);
    }
  },
);

// POST /rides/:id/uncancel - Uncancel a ride (LEADER/ADMIN only)
ridesRouter.post(
  "/:id/uncancel",
  requireAuth,
  requireClubRole("LEADER", "ADMIN"),
  async (c) => {
    const club = c.get("club");
    const id = c.req.param("id");

    const existing = await db.query.rides.findFirst({
      where: and(
        eq(rides.id, id),
        eq(rides.clubId, club.id),
        eq(rides.deleted, false),
      ),
    });

    if (!existing) {
      return c.json({ error: "Ride not found" }, 404);
    }

    try {
      await db
        .update(rides)
        .set({ cancelled: false, updatedAt: new Date().toISOString() })
        .where(and(eq(rides.id, id), eq(rides.clubId, club.id)));

      void cacheInvalidate(buildCacheKey("detail", club.id, { rideId: id }));
      void cacheInvalidatePattern(clubCachePattern(club.id));

      return c.json({ success: true });
    } catch (error) {
      console.error("Uncancel ride error:", error);
      return c.json({ error: "Failed to uncancel ride" }, 500);
    }
  },
);
