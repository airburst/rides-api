import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { clubs, userClubs, users } from "../db/schema/index.js";
import {
  authMiddleware,
  getAuthUser,
  type AuthUser,
} from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/club.js";

interface Vars { user: AuthUser }

export const clubsRouter = new Hono<{ Variables: Vars }>();

const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "www",
  "health",
  "clubs",
  "static",
  "assets",
  "public",
  "cdn",
  "media",
  "upload",
  "download",
  "auth",
  "login",
  "logout",
  "signup",
  "signin",
  "register",
  "oauth",
  "callback",
  "account",
  "me",
  "users",
  "rides",
  "repeating-rides",
  "members",
  "settings",
  "profile",
  "dashboard",
  "status",
  "metrics",
  "ping",
  "internal",
  "debug",
  "monitoring",
  "about",
  "contact",
  "blog",
  "home",
  "help",
  "support",
  "docs",
  "pricing",
  "legal",
  "terms",
  "privacy",
  "mail",
  "staging",
  "dev",
  "test",
  "prod",
]);

const slugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
    message:
      "Slug must be lowercase, start with a letter, and contain only letters, digits, or dashes",
  })
  .refine((s) => !RESERVED_SLUGS.has(s), { message: "Reserved slug" });

const createClubSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  settings: z.record(z.string(), z.unknown()).optional(),
  allowedOrigins: z.array(z.url()).optional(),
});

const updateClubSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  allowedOrigins: z.array(z.url()).optional(),
});

const memberSchema = z.object({
  userId: z.string(),
  role: z.enum(["USER", "LEADER", "ADMIN"]).default("USER"),
});

const updateMemberSchema = z.object({
  role: z.enum(["USER", "LEADER", "ADMIN"]),
});

clubsRouter.use("*", authMiddleware);

// POST /clubs — super-admin only: create a new club
clubsRouter.post("/", requireSuperAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = createClubSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Validation failed", details: z.treeifyError(result.error) },
      400,
    );
  }

  const data = result.data;

  // Slug must be unique
  const existing = await db.query.clubs.findFirst({
    where: eq(clubs.slug, data.slug),
  });
  if (existing) {
    return c.json({ error: "Slug already in use" }, 409);
  }

  const id = crypto.randomUUID();

  try {
    await db.insert(clubs).values({
      id,
      slug: data.slug,
      name: data.name,
      settings: data.settings ?? {},
      allowedOrigins: data.allowedOrigins ?? [],
    });

    return c.json({ success: true, id, slug: data.slug }, 201);
  } catch (error) {
    console.error("Create club error:", error);
    return c.json({ error: "Failed to create club" }, 500);
  }
});

// GET /clubs — list clubs the user is a member of (or all, if super-admin)
clubsRouter.get("/", async (c) => {
  const user = getAuthUser(c);

  try {
    if (user.isSuperAdmin) {
      const all = await db.query.clubs.findMany();
      return c.json({ clubs: all });
    }

    const memberships = await db
      .select({
        clubId: userClubs.clubId,
        role: userClubs.role,
      })
      .from(userClubs)
      .where(eq(userClubs.userId, user.id));

    if (memberships.length === 0) {
      return c.json({ clubs: [] });
    }

    const result = await db.query.clubs.findMany();
    const memberClubIds = new Set(memberships.map((m) => m.clubId));
    const filtered = result
      .filter((club) => memberClubIds.has(club.id))
      .map((club) => ({
        ...club,
        role: memberships.find((m) => m.clubId === club.id)?.role,
      }));

    return c.json({ clubs: filtered });
  } catch (error) {
    console.error("List clubs error:", error);
    return c.json({ error: "Failed to list clubs" }, 500);
  }
});

// GET /clubs/:slug — fetch single club (member or super-admin)
clubsRouter.get("/:slug", async (c) => {
  const user = getAuthUser(c);
  const slug = c.req.param("slug");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  if (!user.isSuperAdmin) {
    const membership = await db.query.userClubs.findFirst({
      where: and(
        eq(userClubs.userId, user.id),
        eq(userClubs.clubId, club.id),
      ),
    });
    if (!membership) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  return c.json({ club });
});

// PATCH /clubs/:slug — update settings (club ADMIN or super-admin)
clubsRouter.patch("/:slug", async (c) => {
  const user = getAuthUser(c);
  const slug = c.req.param("slug");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  if (!user.isSuperAdmin) {
    const membership = await db.query.userClubs.findFirst({
      where: and(
        eq(userClubs.userId, user.id),
        eq(userClubs.clubId, club.id),
      ),
    });
    if (membership?.role !== "ADMIN") {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = updateClubSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Validation failed", details: z.treeifyError(result.error) },
      400,
    );
  }

  const data = result.data;
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.settings !== undefined) updateData.settings = data.settings;
  if (data.allowedOrigins !== undefined)
    updateData.allowedOrigins = data.allowedOrigins;

  try {
    await db.update(clubs).set(updateData).where(eq(clubs.id, club.id));
    return c.json({ success: true });
  } catch (error) {
    console.error("Update club error:", error);
    return c.json({ error: "Failed to update club" }, 500);
  }
});

// Helper: confirm caller is club ADMIN or super-admin
async function requireClubAdmin(
  user: AuthUser,
  clubId: string,
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const membership = await db.query.userClubs.findFirst({
    where: and(eq(userClubs.userId, user.id), eq(userClubs.clubId, clubId)),
  });
  return membership?.role === "ADMIN";
}

// POST /clubs/:slug/members — add a user to the club
clubsRouter.post("/:slug/members", async (c) => {
  const user = getAuthUser(c);
  const slug = c.req.param("slug");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  if (!(await requireClubAdmin(user, club.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = memberSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Validation failed", details: z.treeifyError(result.error) },
      400,
    );
  }

  const data = result.data;

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, data.userId),
  });
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    await db
      .insert(userClubs)
      .values({
        userId: data.userId,
        clubId: club.id,
        role: data.role,
      })
      .onConflictDoNothing();

    return c.json({ success: true });
  } catch (error) {
    console.error("Add member error:", error);
    return c.json({ error: "Failed to add member" }, 500);
  }
});

// PATCH /clubs/:slug/members/:userId — change a member's role
clubsRouter.patch("/:slug/members/:userId", async (c) => {
  const user = getAuthUser(c);
  const slug = c.req.param("slug");
  const targetUserId = c.req.param("userId");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  if (!(await requireClubAdmin(user, club.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = updateMemberSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      { error: "Validation failed", details: z.treeifyError(result.error) },
      400,
    );
  }

  try {
    const updated = await db
      .update(userClubs)
      .set({ role: result.data.role })
      .where(
        and(
          eq(userClubs.userId, targetUserId),
          eq(userClubs.clubId, club.id),
        ),
      )
      .returning({ userId: userClubs.userId });

    if (updated.length === 0) {
      return c.json({ error: "Member not found in this club" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Update member error:", error);
    return c.json({ error: "Failed to update member" }, 500);
  }
});

// DELETE /clubs/:slug/members/:userId — remove a user from the club
clubsRouter.delete("/:slug/members/:userId", async (c) => {
  const user = getAuthUser(c);
  const slug = c.req.param("slug");
  const targetUserId = c.req.param("userId");

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  if (!(await requireClubAdmin(user, club.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const removed = await db
      .delete(userClubs)
      .where(
        and(
          eq(userClubs.userId, targetUserId),
          eq(userClubs.clubId, club.id),
        ),
      )
      .returning({ userId: userClubs.userId });

    if (removed.length === 0) {
      return c.json({ error: "Member not found in this club" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return c.json({ error: "Failed to remove member" }, 500);
  }
});
