import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { clubs, userClubs } from "../db/schema/index.js";
import { auth } from "../lib/auth.js";

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

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: c.req.raw.headers,
  });

  if (!result.user.id) {
    return c.json({ error: "Signup failed" }, 500);
  }

  await db.insert(userClubs).values({
    userId: result.user.id,
    clubId: club.id,
    role: "USER",
  });

  return c.json({ success: true, requiresVerification: true }, 201);
});
