import { createMiddleware } from "hono/factory";
import { verifyAuth0Token } from "../lib/auth0.js";
import { db } from "../db/index.js";
import { accounts } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

export interface AuthUser {
  id: string;
  auth0Id: string;
  role: string;
  name: string | null;
  email: string | null;
}

// Required auth - returns 401 if not authenticated
export const authMiddleware = createMiddleware<{
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAuth0Token(token);

    // Look up user by Auth0 ID in accounts table
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.providerAccountId, payload.sub),
      with: { users: true },
    });

    if (!account?.users) {
      return c.json({ error: "User not found" }, 401);
    }

    c.set("user", {
      id: account.users.id,
      auth0Id: payload.sub,
      role: account.users.role ?? "USER",
      name: account.users.name,
      email: account.users.email,
    });

    await next();
  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ error: "Invalid token" }, 401);
  }
});

// Optional auth - sets user if present, continues if not
export const optionalAuth = createMiddleware<{
  Variables: { user?: AuthUser };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = await verifyAuth0Token(token);

      const account = await db.query.accounts.findFirst({
        where: eq(accounts.providerAccountId, payload.sub),
        with: { users: true },
      });

      if (account?.users) {
        c.set("user", {
          id: account.users.id,
          auth0Id: payload.sub,
          role: account.users.role ?? "USER",
          name: account.users.name,
          email: account.users.email,
        });
      }
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  await next();
});

// Role check helper
export const requireRole = (...allowedRoles: string[]) => {
  return createMiddleware<{ Variables: { user: AuthUser } }>(
    async (c, next) => {
      const user = c.get("user");
      if (!allowedRoles.includes(user.role)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      await next();
    },
  );
};
