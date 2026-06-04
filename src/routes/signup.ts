import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { clubs, userClubs, users } from "../db/schema/index.js";
import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";

export const signupRouter = new Hono();

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

// Club-scoped signup: creates user + user_clubs row in one flow
signupRouter.post("/club/:slug", async (c) => {
  const { slug } = c.req.param();

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
  });

  if (!club) {
    return c.json({ error: "Club not found" }, 404);
  }

  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", details: z.treeifyError(parsed.error) },
      400,
    );
  }

  const { email, password, name } = parsed.data;

  // Check for existing account before calling better-auth — signUpEmail with
  // requireEmailVerification returns a phantom user ID that is never persisted
  // when the email already exists, which would cause a FK violation on user_clubs.
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    const membership = await db.query.userClubs.findFirst({
      where: and(
        eq(userClubs.userId, existingUser.id),
        eq(userClubs.clubId, club.id),
      ),
    });
    return c.json(
      {
        error: membership
          ? "Already a member of this club"
          : "An account with this email already exists",
      },
      409,
    );
  }

  try {
    const origin = c.req.header("origin") ?? env("APP_URL") ?? "";
    await auth.api.signUpEmail({
      body: { email, password, name, callbackURL: `${origin}/auth/verified` },
      headers: c.req.raw.headers,
    });
  } catch (e) {
    console.error("[SIGNUP] signUpEmail failed:", e);
    return c.json({ error: "Signup failed" }, 500);
  }

  // Look up by email — better-auth's returned user.id can't be trusted when
  // requireEmailVerification is enabled (see: phantom-id bug above).
  const newUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!newUser) {
    return c.json({ error: "Signup failed" }, 500);
  }

  try {
    await db.insert(userClubs).values({
      userId: newUser.id,
      clubId: club.id,
      role: "USER",
    });
  } catch {
    return c.json({ error: "Already a member of this club" }, 409);
  }

  return c.json({ success: true, requiresVerification: true }, 201);
});
