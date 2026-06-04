import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/index.js";
import { clubs, userClubs, type Role } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import type { AuthUser } from "./auth.js";

export interface ClubContext {
  id: string;
  slug: string;
  role: Role;
}

const DEFAULT_CLUB_SLUG = env("DEFAULT_CLUB_SLUG");
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isStrictTenancy = () => env("STRICT_TENANCY");
const isUuid = (value: string) => UUID_REGEX.test(value);

async function findClubById(id: string) {
  return db.query.clubs.findFirst({ where: eq(clubs.id, id) });
}

async function findClubBySlug(slug: string) {
  return db.query.clubs.findFirst({ where: eq(clubs.slug, slug) });
}

export const resolveClub = createMiddleware<{
  Variables: { user?: AuthUser; club: ClubContext };
}>(async (c, next) => {
  const clubId = c.req.header("X-Club-Id");
  const clubSlug = c.req.query("club");

  if (!clubId && !clubSlug) {
    if (isStrictTenancy()) {
      return c.json(
        { error: "Missing X-Club-Id header or ?club= query param" },
        400,
      );
    }
  }

  let club;
  if (clubId) {
    club = isUuid(clubId) ? await findClubById(clubId) : null;
    club ??= await findClubBySlug(clubId);
  } else {
    club = await findClubBySlug(clubSlug ?? DEFAULT_CLUB_SLUG);
  }

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
