import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/index.js";
import { accounts, users } from "../db/schema/index.js";
import { auth } from "../lib/auth.js";
import {
  fetchAuth0UserInfo,
  verifyAuth0Token,
  type Auth0TokenPayload,
} from "../lib/auth0.js";

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
  name: string | null;
  email: string | null;
  sessionId?: string;
}

function updateLastLogin(userId: string): void {
  void db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

async function findOrProvisionUser(
  payload: Auth0TokenPayload,
  accessToken: string,
) {
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.accountId, payload.sub),
    with: { users: true },
  });

  if (existing?.users) return existing.users;

  // JIT provisioning: fetch profile from Auth0 and create user + account
  const userInfo = await fetchAuth0UserInfo(accessToken);
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: userInfo.email ?? `${payload.sub}@placeholder.local`,
      name: userInfo.name === userInfo.email ? null : (userInfo.name ?? null),
      image: userInfo.picture ?? null,
    });

    await tx.insert(accounts).values({
      id: accountId,
      accountId: payload.sub,
      providerId: "auth0",
      userId,
    });
  });

  console.info(`Provisioned new user ${userId} for Auth0 sub ${payload.sub}`);

  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

// ── better-auth path (reads Cookie header) ─────────────────────────────────
async function resolveBetterAuthUser(
  headers: Headers,
): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  updateLastLogin(session.user.id);
  const u = session.user as typeof session.user & { isSuperAdmin: boolean };
  return {
    id: u.id,
    isSuperAdmin: u.isSuperAdmin,
    name: u.name,
    email: u.email,
    sessionId: session.session.id,
  };
}

// ── Auth0 path (reads Authorization: Bearer header) ─────────────────────────
// DELETE this function and its call site after BCC migration complete
async function resolveAuth0User(token: string): Promise<AuthUser | null> {
  const payload = await verifyAuth0Token(token);
  const user = await findOrProvisionUser(payload, token);
  if (!user) return null;
  updateLastLogin(user.id);
  return {
    id: user.id,
    isSuperAdmin: user.isSuperAdmin,
    name: user.name ?? null,
    email: user.email,
  };
}
// ── END DELETE ──────────────────────────────────────────────────────────────

// ── main resolver ────────────────────────────────────────────────────────────
async function resolveUser(
  headers: Headers,
  authHeader: string | undefined,
): Promise<AuthUser | null> {
  const fromCookie = await resolveBetterAuthUser(headers);
  if (fromCookie) return fromCookie;

  // ── DELETE block below after BCC migration ───────────────────────────────
  if (authHeader?.startsWith("Bearer ")) {
    return resolveAuth0User(authHeader.slice(7));
  }
  // ── END DELETE ───────────────────────────────────────────────────────────

  return null;
}

// Required auth - returns 401 if not authenticated
export const authMiddleware = createMiddleware<{
  Variables: { user: AuthUser };
}>(async (c, next) => {
  // dev-only auth bypass — refuses to operate in production
  if (process.env.DEV_SKIP_AUTH === "true") {
    if (process.env.NODE_ENV !== "development") {
      return c.json(
        { error: "DEV_SKIP_AUTH is only allowed when NODE_ENV=development" },
        500,
      );
    }
    const email = process.env.DEV_SKIP_AUTH_USER;
    if (!email) {
      return c.json(
        { error: "DEV_SKIP_AUTH_USER is required when DEV_SKIP_AUTH=true" },
        500,
      );
    }
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      return c.json(
        { error: `DEV_SKIP_AUTH_USER not found in DB: ${email}` },
        500,
      );
    }
    c.set("user", {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      name: user.name ?? null,
      email: user.email,
    });
    return next();
  }

  try {
    const user = await resolveUser(
      c.req.raw.headers,
      c.req.header("Authorization"),
    );
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("user", user);
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
  // dev-only auth bypass — refuses to operate in production
  if (process.env.DEV_SKIP_AUTH === "true") {
    if (process.env.NODE_ENV !== "development") {
      return c.json(
        { error: "DEV_SKIP_AUTH is only allowed when NODE_ENV=development" },
        500,
      );
    }
    const email = process.env.DEV_SKIP_AUTH_USER;
    if (!email) {
      return c.json(
        { error: "DEV_SKIP_AUTH_USER is required when DEV_SKIP_AUTH=true" },
        500,
      );
    }
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      return c.json(
        { error: `DEV_SKIP_AUTH_USER not found in DB: ${email}` },
        500,
      );
    }
    c.set("user", {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      name: user.name ?? null,
      email: user.email,
    });
    return next();
  }

  try {
    const user = await resolveUser(
      c.req.raw.headers,
      c.req.header("Authorization"),
    );
    if (user) c.set("user", user);
  } catch {
    // Ignore auth errors for optional auth
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
