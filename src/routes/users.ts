import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { db } from "../db/index.js";
import { clubs, userClubs, users } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import {
  authMiddleware,
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

interface Vars {
  user?: AuthUser;
  club: ClubContext;
}

export const usersRouter = new Hono<{ Variables: Vars }>();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_REGEX.test(value);

// Validation schema for user updates
const updateUserSchema = z.object({
  name: z.string().optional(),
  mobile: z.string().optional(),
  emergency: z.string().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  // Role change applies to user_clubs.role for the active club
  role: z.enum(["USER", "LEADER", "ADMIN"]).optional(),
  membershipId: z.string().optional(),
  membershipStatus: z.string().optional(),
});

// GET /users/me - current user + per-club memberships. Does not require a club context.
// Includes a top-level `role` compat field derived from the active club (X-Club-Id
// header / ?club= / DEFAULT_CLUB_SLUG fallback) so the legacy single-club frontend
// keeps working. Remove once frontend reads from `user.clubs[]`.
usersRouter.get("/me", authMiddleware, async (c) => {
  const authUser = c.get("user");

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, authUser.id),
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const memberships = await db
      .select({ clubId: userClubs.clubId, role: userClubs.role })
      .from(userClubs)
      .where(eq(userClubs.userId, authUser.id));

    // Resolve active club for compat role. Fall back to default club.
    const identifier =
      c.req.header("X-Club-Id") ??
      c.req.query("club") ??
      env("DEFAULT_CLUB_SLUG");
    const activeClub = await db.query.clubs.findFirst({
      where: isUuid(identifier)
        ? or(eq(clubs.slug, identifier), eq(clubs.id, identifier))
        : eq(clubs.slug, identifier),
    });

    const activeMembership = activeClub
      ? memberships.find((m) => m.clubId === activeClub.id)
      : undefined;

    const compatRole = authUser.isSuperAdmin
      ? "ADMIN"
      : (activeMembership?.role ?? "USER");

    return c.json({
      user: { ...user, role: compatRole, clubs: memberships },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// All other routes are scoped to an active club
usersRouter.use("*", optionalAuth, resolveClub);

// GET /users - List users in this club (club ADMIN only)
usersRouter.get("/", requireAuth, requireClubRole("ADMIN"), async (c) => {
  const club = c.get("club");
  const query = c.req.query("q");

  try {
    // Find user IDs belonging to this club
    const memberRows = await db
      .select({ userId: userClubs.userId })
      .from(userClubs)
      .where(eq(userClubs.clubId, club.id));
    const memberIds = memberRows.map((r) => r.userId);

    if (memberIds.length === 0) {
      return c.json({ users: [] });
    }

    const baseColumns = {
      id: true,
      name: true,
      email: true,
      image: true,
      membershipId: true,
      membershipStatus: true,
    } as const;

    let result;
    if (query) {
      const lowerQuery = `%${query.toLowerCase()}%`;
      result = await db.query.users.findMany({
        columns: baseColumns,
        where: and(
          inArray(users.id, memberIds),
          or(ilike(users.name, lowerQuery), ilike(users.email, lowerQuery)),
        ),
        orderBy: [asc(users.name)],
      });
    } else {
      result = await db.query.users.findMany({
        columns: baseColumns,
        where: inArray(users.id, memberIds),
        orderBy: [asc(users.name)],
      });
    }

    return c.json({ users: result });
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

// GET /users/:id - Get a specific user (self or club ADMIN; target must be in same club)
usersRouter.get("/:id", requireAuth, async (c) => {
  const authUser = getAuthUser(c);
  const club = c.get("club");
  const id = c.req.param("id");

  const isSelf = authUser.id === id;
  const isAdmin = club.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Target must be in the active club (super-admin role is set to ADMIN by middleware → bypass)
  if (!authUser.isSuperAdmin) {
    const targetMembership = await db.query.userClubs.findFirst({
      where: and(eq(userClubs.userId, id), eq(userClubs.clubId, club.id)),
    });
    if (!targetMembership) {
      return c.json({ error: "User not found in this club" }, 404);
    }
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// PATCH /users/:id - Update a user (self or club ADMIN). Role update writes to user_clubs.role.
usersRouter.patch("/:id", requireAuth, async (c) => {
  const authUser = getAuthUser(c);
  const club = c.get("club");
  const id = c.req.param("id");

  const isSelf = authUser.id === id;
  const isAdmin = club.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = updateUserSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Validation failed", details: z.treeifyError(result.error) },
      400,
    );
  }

  const data = result.data;

  if (!isAdmin && data.role) {
    return c.json({ error: "Cannot change role" }, 403);
  }

  // Verify target is in active club (super-admin bypass)
  if (!authUser.isSuperAdmin) {
    const targetMembership = await db.query.userClubs.findFirst({
      where: and(eq(userClubs.userId, id), eq(userClubs.clubId, club.id)),
    });
    if (!targetMembership) {
      return c.json({ error: "User not found in this club" }, 404);
    }
  }

  // Build user-table update (everything except role)
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.mobile !== undefined) updateData.mobile = data.mobile;
  if (data.emergency !== undefined) updateData.emergency = data.emergency;
  if (data.preferences !== undefined) updateData.preferences = data.preferences;
  if (data.membershipId !== undefined)
    updateData.membershipId = data.membershipId;
  if (data.membershipStatus !== undefined)
    updateData.membershipStatus = data.membershipStatus;

  try {
    if (Object.keys(updateData).length > 0) {
      await db.update(users).set(updateData).where(eq(users.id, id));
    }

    if (data.role !== undefined && isAdmin) {
      await db
        .update(userClubs)
        .set({ role: data.role })
        .where(and(eq(userClubs.userId, id), eq(userClubs.clubId, club.id)));
    }

    return c.json({ success: true, id });
  } catch (error) {
    console.error("Update user error:", error);
    return c.json({ error: "Failed to update user" }, 500);
  }
});

// POST /users/:id/avatar - Upload avatar image
usersRouter.post("/:id/avatar", requireAuth, async (c) => {
  const authUser = getAuthUser(c);
  const club = c.get("club");
  const id = c.req.param("id");

  const isSelf = authUser.id === id;
  const isAdmin = club.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!authUser.isSuperAdmin) {
    const targetMembership = await db.query.userClubs.findFirst({
      where: and(eq(userClubs.userId, id), eq(userClubs.clubId, club.id)),
    });
    if (!targetMembership) {
      return c.json({ error: "User not found in this club" }, 404);
    }
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("avatar");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (!file.type.startsWith("image/")) {
      return c.json({ error: "File must be an image" }, 400);
    }

    const MAX_FILE_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: "File size exceeds 8MB limit" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicDir = join(process.cwd(), "public", "avatars");

    const thumbPath = join(publicDir, `${id}-thumb.webp`);
    await sharp(buffer)
      .resize(40, 40, { fit: "cover", position: "center" })
      .webp({ quality: 80 })
      .toFile(thumbPath);

    const standardPath = join(publicDir, `${id}.webp`);
    await sharp(buffer)
      .resize(240, 240, { fit: "cover", position: "center" })
      .webp({ quality: 85 })
      .toFile(standardPath);

    const imagePath = `/avatars/${id}-thumb.webp`;
    const imageLargePath = `/avatars/${id}.webp`;

    await db
      .update(users)
      .set({
        image: imagePath,
        imageLarge: imageLargePath,
      })
      .where(eq(users.id, id));

    return c.json({
      success: true,
      image: imagePath,
      imageLarge: imageLargePath,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return c.json({ error: "Failed to upload avatar" }, 500);
  }
});
