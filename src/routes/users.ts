import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";

export const usersRouter = new Hono<{ Variables: { user: AuthUser } }>();

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
