import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";

export const usersRouter = new Hono<{ Variables: { user: AuthUser } }>();

// Validation schema for user updates
const updateUserSchema = z.object({
  name: z.string().optional(),
  mobile: z.string().optional(),
  emergency: z.string().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  role: z.enum(["USER", "LEADER", "ADMIN"]).optional(),
  membershipId: z.string().optional(),
  membershipStatus: z.string().optional(),
});

// GET /users/me - Get current user
usersRouter.get("/me", authMiddleware, async (c) => {
  const authUser = c.get("user");

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, authUser.id),
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

// GET /users/:id - Get a specific user (self or admin)
usersRouter.get("/:id", authMiddleware, async (c) => {
  const authUser = c.get("user");
  const id = c.req.param("id");

  // Users can only get their own profile, admins can get anyone
  const isSelf = authUser.id === id;
  const isAdmin = authUser.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
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

// PATCH /users/:id - Update a user (self or admin)
usersRouter.patch("/:id", authMiddleware, async (c) => {
  const authUser = c.get("user");
  const id = c.req.param("id");

  // Users can only update their own profile, admins can update anyone
  const isSelf = authUser.id === id;
  const isAdmin = authUser.role === "ADMIN";

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

  // Non-admins cannot change role
  if (!isAdmin && data.role) {
    return c.json({ error: "Cannot change role" }, 403);
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.mobile !== undefined) updateData.mobile = data.mobile;
  if (data.emergency !== undefined) updateData.emergency = data.emergency;
  if (data.preferences !== undefined) updateData.preferences = data.preferences;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.membershipId !== undefined) updateData.membershipId = data.membershipId;
  if (data.membershipStatus !== undefined) updateData.membershipStatus = data.membershipStatus;

  try {
    await db.update(users).set(updateData).where(eq(users.id, id));
    return c.json({ success: true, id });
  } catch (error) {
    console.error("Update user error:", error);
    return c.json({ error: "Failed to update user" }, 500);
  }
});
