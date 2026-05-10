import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/index.js";
import { clubs, userClubs, type Role } from "../db/schema/index.js";
import type { AuthUser } from "./auth.js";

export interface ClubContext {
  id: string;
  slug: string;
  role: Role;
}

const DEFAULT_CLUB_SLUG = process.env.DEFAULT_CLUB_SLUG ?? "bcc";

const isStrictTenancy = () => process.env.STRICT_TENANCY === "true";

async function findClub(identifier: string) {
  const bySlug = await db.query.clubs.findFirst({
    where: eq(clubs.slug, identifier),
  });
  if (bySlug) return bySlug;
  return db.query.clubs.findFirst({ where: eq(clubs.id, identifier) });
}

export const resolveClub = createMiddleware<{
  Variables: { user?: AuthUser; club: ClubContext };
}>(async (c, next) => {
  let identifier = c.req.header("X-Club-Id") ?? c.req.query("club");

  if (!identifier) {
    if (isStrictTenancy()) {
      return c.json(
        { error: "Missing X-Club-Id header or ?club= query param" },
        400,
      );
    }
    identifier = DEFAULT_CLUB_SLUG;
  }

  const club = await findClub(identifier);
  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  const user = c.get("user");

  if (user?.isSuperAdmin) {
    c.set("club", { id: club.id, slug: club.slug, role: "ADMIN" });
  } else if (user) {
    const membership = await db.query.userClubs.findFirst({
      where: and(eq(userClubs.userId, user.id), eq(userClubs.clubId, club.id)),
    });
    if (!membership) {
      return c.json({ error: "Forbidden: not a member of this club" }, 403);
    }
    c.set("club", { id: club.id, slug: club.slug, role: membership.role });
  } else {
    c.set("club", { id: club.id, slug: club.slug, role: "USER" });
  }

  await next();
});

export const requireClubRole = (...allowedRoles: Role[]) => {
  return createMiddleware<{ Variables: { club: ClubContext } }>(
    async (c, next) => {
      const club = c.get("club");
      if (!allowedRoles.includes(club.role)) {
        return c.json({ error: "Forbidden" }, 403);
      }
      await next();
    },
  );
};

export const requireSuperAdmin = createMiddleware<{
  Variables: { user?: AuthUser };
}>(async (c, next) => {
  const user = c.get("user");
  if (!user?.isSuperAdmin) {
    return c.json({ error: "Forbidden: super-admin only" }, 403);
  }
  await next();
});
