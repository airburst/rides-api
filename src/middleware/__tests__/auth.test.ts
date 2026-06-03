/**
 * DEV_SKIP_AUTH bypass tests.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { AuthUser } from "../auth.js";

const TEST_USER = {
  id: "dev-user-id",
  email: "dev@local",
  name: "Dev User",
  isSuperAdmin: true,
};

mock.module("../../db/index.js", () => ({
  db: {
    query: {
      users: {
        findFirst: mock(async () => TEST_USER),
      },
      accounts: {
        findFirst: mock(async () => null),
      },
    },
  },
}));

mock.module("../../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: mock(async () => null),
    },
  },
}));

mock.module("../../lib/auth0.js", () => ({
  verifyAuth0Token: mock(async () => {
    throw new Error("Invalid token");
  }),
  fetchAuth0UserInfo: mock(async () => {
    throw new Error("Not implemented");
  }),
}));

describe("authMiddleware with DEV_SKIP_AUTH", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("bypasses auth and injects dev user when flag is on", async () => {
    process.env.DEV_SKIP_AUTH = "true";
    process.env.DEV_SKIP_AUTH_USER = "dev@local";
    process.env.NODE_ENV = "development";

    const { authMiddleware } = await import("../auth.js");
    const app = new Hono<{ Variables: { user: AuthUser } }>();
    app.use("*", authMiddleware);
    app.get("/who", (c) => c.json(c.get("user")));

    const res = await app.request("/who");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("dev@local");
    expect(body.isSuperAdmin).toBe(true);
  });

  test("refuses to operate when NODE_ENV is not development (production)", async () => {
    process.env.DEV_SKIP_AUTH = "true";
    process.env.DEV_SKIP_AUTH_USER = "dev@local";
    process.env.NODE_ENV = "production";

    const { authMiddleware } = await import("../auth.js");
    const app = new Hono();
    app.use("*", authMiddleware);
    app.get("/who", (c) => c.json({}));

    const res = await app.request("/who");
    expect(res.status).toBe(500);
  });

  test("refuses to operate when NODE_ENV is not development (staging)", async () => {
    process.env.DEV_SKIP_AUTH = "true";
    process.env.DEV_SKIP_AUTH_USER = "dev@local";
    process.env.NODE_ENV = "staging";

    const { authMiddleware } = await import("../auth.js");
    const app = new Hono();
    app.use("*", authMiddleware);
    app.get("/who", (c) => c.json({}));

    const res = await app.request("/who");
    expect(res.status).toBe(500);
  });

  test("falls through to Auth0 path when flag is unset", async () => {
    delete process.env.DEV_SKIP_AUTH;

    const { authMiddleware } = await import("../auth.js");
    const app = new Hono();
    app.use("*", authMiddleware);
    app.get("/who", (c) => c.json({}));

    const res = await app.request("/who");
    expect(res.status).toBe(401); // no bearer header
  });
});
