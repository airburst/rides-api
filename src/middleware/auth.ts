import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/index.js";
import { accounts, users } from "../db/schema/index.js";
import {
  fetchAuth0UserInfo,
  verifyAuth0Token,
  type Auth0TokenPayload,
} from "../lib/auth0.js";

export interface AuthUser {
  id: string;
  auth0Id: string;
  role: string;
  isSuperAdmin: boolean;
  name: string | null;
  email: string | null;
}

async function findOrProvisionUser(
  payload: Auth0TokenPayload,
  accessToken: string,
) {
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.providerAccountId, payload.sub),
    with: { users: true },
  });

  if (existing?.users) return existing.users;

  // JIT provisioning: fetch profile from Auth0 and create user + account
  const userInfo = await fetchAuth0UserInfo(accessToken);
  const userId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: userInfo.email ?? `${payload.sub}@placeholder.local`,
      name: userInfo.name === userInfo.email ? null : (userInfo.name ?? null),
      image: userInfo.picture ?? null,
    });

    await tx.insert(accounts).values({
      userId,
      type: "oauth",
      provider: "auth0",
      providerAccountId: payload.sub,
    });
  });

  console.info(`Provisioned new user ${userId} for Auth0 sub ${payload.sub}`);

  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
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
    const user = await findOrProvisionUser(payload, token);

    if (!user) {
      return c.json({ error: "User provisioning failed" }, 500);
    }

    c.set("user", {
      id: user.id,
      auth0Id: payload.sub,
      role: user.role ?? "USER",
      isSuperAdmin: user.isSuperAdmin,
      name: user.name,
      email: user.email,
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
      const user = await findOrProvisionUser(payload, token);

      if (user) {
        c.set("user", {
          id: user.id,
          auth0Id: payload.sub,
          role: user.role ?? "USER",
          isSuperAdmin: user.isSuperAdmin,
          name: user.name,
          email: user.email,
        });
      }
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  await next();
});

// Gate that checks user is set (use after optionalAuth when auth is required)
export const requireAuth = createMiddleware<{
  Variables: { user?: AuthUser };
}>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Type-safe accessor for handlers that run after requireAuth.
export function getAuthUser(c: { get: (key: "user") => AuthUser | undefined }) {
  const user = c.get("user");
  if (!user) {
    throw new Error("getAuthUser called without authenticated user");
  }
  return user;
}

// Role check helper (legacy — reads user.role; prefer requireClubRole)
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
