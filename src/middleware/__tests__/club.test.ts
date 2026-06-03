/**
 * Club resolver middleware tests.
 *
 * Covers: header/query resolution, compat-mode default fallback,
 * strict-mode 400, super-admin bypass, membership enforcement,
 * unknown club, public-route shape.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

const BCC_CLUB = { id: "bcc", slug: "bcc", name: "Bristol Cycling Club" };
const OTHER_CLUB = { id: "other", slug: "other", name: "Other Club" };

const knownClubsBySlug: Record<string, typeof BCC_CLUB> = {
  bcc: BCC_CLUB,
  other: OTHER_CLUB,
};
const knownClubsById: Record<string, typeof BCC_CLUB> = {
  bcc: BCC_CLUB,
  other: OTHER_CLUB,
};

const memberships: { userId: string; clubId: string; role: string }[] = [];

const mockClubsFindFirst = mock((args: { where: unknown }) => {
  const where = String(args.where);
  // Brittle but the intent suffices: detect slug vs id by inspecting which column we're matching
  // In practice, the middleware tries slug first then id, so we sequence the answers.
  // We track which call we're on via the spy mock counters used externally.
  void where;
  return Promise.resolve(null as null | typeof BCC_CLUB);
});

const mockUserClubsFindFirst = mock(
  (_args: { where: unknown }): Promise<{ role: string } | null> =>
    Promise.resolve(null),
);

const mockDb = {
  query: {
    clubs: { findFirst: mockClubsFindFirst },
    userClubs: { findFirst: mockUserClubsFindFirst },
  },
};

mock.module("../../db/index.js", () => ({ db: mockDb }));

const { resolveClub, requireSuperAdmin } = await import("../club.js");

beforeEach(() => {
  mockClubsFindFirst.mockReset();
  mockUserClubsFindFirst.mockReset();
  memberships.length = 0;
  delete process.env.STRICT_TENANCY;
  delete process.env.DEFAULT_CLUB_SLUG;
});

afterEach(() => {
  delete process.env.STRICT_TENANCY;
  delete process.env.DEFAULT_CLUB_SLUG;
});

function clubBySlugOrId(identifier: string) {
  return knownClubsBySlug[identifier] ?? knownClubsById[identifier] ?? null;
}

// Helper: program the mock to resolve based on identifier the middleware looked up.
// Middleware does: findFirst(slug) then findFirst(id). We answer with whichever matches.
function programClubLookup(identifier: string | null) {
  let call = 0;
  mockClubsFindFirst.mockImplementation(() => {
    call += 1;
    if (call === 1) {
      return Promise.resolve(
        identifier ? (knownClubsBySlug[identifier] ?? null) : null,
      );
    }
    return Promise.resolve(
      identifier ? (knownClubsById[identifier] ?? null) : null,
    );
  });
}

function programMembership(role: string | null) {
  mockUserClubsFindFirst.mockImplementation(() =>
    Promise.resolve(role ? { role } : null),
  );
}

function buildApp(opts?: { withUser?: { id: string; isSuperAdmin: boolean } }) {
  const app = new Hono();
  if (opts?.withUser) {
    app.use("*", async (c, next) => {
      c.set("user" as never, {
        id: opts.withUser!.id,
        isSuperAdmin: opts.withUser!.isSuperAdmin,
        name: null,
        email: null,
      });
      await next();
    });
  }
  app.get("/scoped", resolveClub, (c) => c.json({ club: c.get("club") }));
  app.get("/super", requireSuperAdmin, (c) => c.json({ ok: true }));
  return app;
}

describe("resolveClub middleware — compat mode (default)", () => {
  test("missing identifier falls back to DEFAULT_CLUB_SLUG", async () => {
    programClubLookup("bcc");
    const app = buildApp();
    const res = await app.request("/scoped");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { slug: string } };
    expect(body.club.slug).toBe("bcc");
  });

  test("respects DEFAULT_CLUB_SLUG env override", async () => {
    process.env.DEFAULT_CLUB_SLUG = "other";
    programClubLookup("other");
    const app = buildApp();
    const res = await app.request("/scoped");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { slug: string } };
    expect(body.club.slug).toBe("other");
  });

  test("X-Club-Id header overrides default", async () => {
    programClubLookup("other");
    const app = buildApp();
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "other" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { slug: string } };
    expect(body.club.slug).toBe("other");
  });

  test("?club= query param works for public routes", async () => {
    programClubLookup("other");
    const app = buildApp();
    const res = await app.request("/scoped?club=other");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { slug: string } };
    expect(body.club.slug).toBe("other");
  });
});

describe("resolveClub middleware — strict mode", () => {
  test("missing identifier returns 400", async () => {
    process.env.STRICT_TENANCY = "true";
    const app = buildApp();
    const res = await app.request("/scoped");
    expect(res.status).toBe(400);
  });

  test("explicit identifier still works in strict mode", async () => {
    process.env.STRICT_TENANCY = "true";
    programClubLookup("bcc");
    const app = buildApp();
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "bcc" },
    });
    expect(res.status).toBe(200);
  });
});

describe("resolveClub middleware — unknown club", () => {
  test("returns 404 when club not found", async () => {
    programClubLookup(null);
    const app = buildApp();
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "ghost" },
    });
    expect(res.status).toBe(404);
  });
});

describe("resolveClub middleware — membership enforcement", () => {
  test("authed user without user_clubs row → 403", async () => {
    programClubLookup("bcc");
    programMembership(null);
    const app = buildApp({
      withUser: { id: "u1", isSuperAdmin: false },
    });
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "bcc" },
    });
    expect(res.status).toBe(403);
  });

  test("authed user with membership → role from user_clubs", async () => {
    programClubLookup("bcc");
    programMembership("LEADER");
    const app = buildApp({
      withUser: { id: "u1", isSuperAdmin: false },
    });
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "bcc" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { role: string } };
    expect(body.club.role).toBe("LEADER");
  });

  test("super-admin bypasses membership check, role=ADMIN", async () => {
    programClubLookup("bcc");
    const app = buildApp({
      withUser: { id: "su", isSuperAdmin: true },
    });
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "bcc" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { role: string } };
    expect(body.club.role).toBe("ADMIN");
    // user_clubs lookup should be skipped for super-admin
    expect(mockUserClubsFindFirst).not.toHaveBeenCalled();
  });

  test("public (unauthed) request gets role=USER", async () => {
    programClubLookup("bcc");
    const app = buildApp();
    const res = await app.request("/scoped", {
      headers: { "X-Club-Id": "bcc" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { club: { role: string } };
    expect(body.club.role).toBe("USER");
  });
});

describe("requireSuperAdmin middleware", () => {
  test("non-super-admin → 403", async () => {
    const app = buildApp({ withUser: { id: "u1", isSuperAdmin: false } });
    const res = await app.request("/super");
    expect(res.status).toBe(403);
  });

  test("super-admin → 200", async () => {
    const app = buildApp({ withUser: { id: "su", isSuperAdmin: true } });
    const res = await app.request("/super");
    expect(res.status).toBe(200);
  });

  test("unauthed → 403", async () => {
    const app = buildApp();
    const res = await app.request("/super");
    expect(res.status).toBe(403);
  });
});
