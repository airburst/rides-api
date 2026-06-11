/**
 * JIT User Provisioning Tests
 *
 * Tests that new Auth0 users are automatically provisioned
 * with users + accounts rows on first authenticated request.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.AUTH0_DOMAIN = "test.auth0.com";
process.env.AUTH0_AUDIENCE = "https://test-api.example.com";

const NEW_USER_TOKEN = "test-token-new-user";
const NEW_USER_SUB = "auth0|brand-new-user";
const EXISTING_USER_TOKEN = "test-token-existing";
const EXISTING_USER_SUB = "auth0|existing-user";

// Track provisioning calls
let insertedUsers: any[] = [];
let insertedAccounts: any[] = [];
let accountLookupCount = 0;

const existingUser = {
  id: "existing-id",
  name: "Existing User",
  email: "existing@test.com",
  isSuperAdmin: false,
  mobile: "1234567890",
  emergency: "Contact 0987654321",
};

const mockInsert = mock((table: any) => ({
  values: mock((data: any) => {
    if (data.providerId) {
      insertedAccounts.push(data);
    } else if (!data.clubId) {
      // clubId present means it's a userClubs insert — skip
      insertedUsers.push(data);
    }
    return Promise.resolve();
  }),
}));

const mockDbQuery = {
  accounts: {
    findFirst: mock(() => {
      accountLookupCount++;
      // First call: check if account exists
      // For existing user, always return the account
      // For new user on first call return null, triggering provisioning
      // After provisioning, the code calls users.findFirst instead
      if (lastVerifiedSub === EXISTING_USER_SUB) {
        return Promise.resolve({
          accountId: EXISTING_USER_SUB,
          users: existingUser,
        });
      }
      return Promise.resolve(null);
    }),
  },
  users: {
    findFirst: mock(() => {
      // Called after provisioning to return the newly created user
      if (insertedUsers.length > 0) {
        const u = insertedUsers[insertedUsers.length - 1];
        return Promise.resolve({
          id: u.id,
          name: u.name,
          email: u.email,
          isSuperAdmin: false,
        });
      }
      return Promise.resolve(null);
    }),
  },
  clubs: {
    findFirst: mock(() => Promise.resolve({ id: "bcc-club-id", slug: "bcc" })),
  },
};

const mockDb = {
  query: mockDbQuery,
  transaction: mock((cb: any) => cb(mockDb)),
  insert: mockInsert,
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
  })),
};

mock.module("../../db/index.js", () => ({ db: mockDb }));

// Track which sub was verified
let lastVerifiedSub: string | null = null;

const mockFetchAuth0UserInfo = mock((_token: string): Promise<any> => {
  // Default: return email-only profile (simulates Auth0 default)
  return Promise.resolve({
    sub: NEW_USER_SUB,
    email: "newuser@example.com",
    name: "newuser@example.com", // Auth0 defaults name to email
    picture: "https://cdn.auth0.com/avatars/ne.png",
  });
});

mock.module("../../lib/auth.js", () => ({
  auth: {
    api: {
      getSession: mock(async () => null),
    },
  },
}));

mock.module("../../lib/auth0.js", () => ({
  verifyAuth0Token: mock((token: string) => {
    switch (token) {
      case NEW_USER_TOKEN:
        lastVerifiedSub = NEW_USER_SUB;
        return Promise.resolve({ sub: NEW_USER_SUB });
      case EXISTING_USER_TOKEN:
        lastVerifiedSub = EXISTING_USER_SUB;
        return Promise.resolve({ sub: EXISTING_USER_SUB });
      default:
        return Promise.reject(new Error("Invalid token"));
    }
  }),
  fetchAuth0UserInfo: mockFetchAuth0UserInfo,
}));

const { authMiddleware } = await import("../auth.js");

// Simple test app with a protected endpoint
const app = new Hono();
app.get("/test", authMiddleware, (c) => {
  const user = c.get("user" as never);
  return c.json({ user });
});

beforeEach(() => {
  insertedUsers = [];
  insertedAccounts = [];
  accountLookupCount = 0;
  lastVerifiedSub = null;
  mockFetchAuth0UserInfo.mockClear();
  mockDbQuery.accounts.findFirst.mockClear();
  mockDbQuery.users.findFirst.mockClear();
  mockDbQuery.clubs.findFirst.mockClear();
  mockInsert.mockClear();
  mockDb.transaction.mockClear();
});

describe("JIT user provisioning", () => {
  test("existing user skips provisioning", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${EXISTING_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("existing-id");
    expect(body.user.name).toBe("Existing User");

    // Should not call /userinfo or insert anything
    expect(mockFetchAuth0UserInfo).not.toHaveBeenCalled();
    expect(insertedUsers).toHaveLength(0);
    expect(insertedAccounts).toHaveLength(0);
  });

  test("new user is provisioned on first request", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);

    // Should have called /userinfo
    expect(mockFetchAuth0UserInfo).toHaveBeenCalledTimes(1);

    // Should have inserted a user row
    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0].email).toBe("newuser@example.com");
    expect(insertedUsers[0].id).toBeDefined();

    // Should have inserted an account row
    expect(insertedAccounts).toHaveLength(1);
    expect(insertedAccounts[0].providerId).toBe("auth0");
    expect(insertedAccounts[0].accountId).toBe(NEW_USER_SUB);
    expect(insertedAccounts[0].userId).toBe(insertedUsers[0].id);
  });

  test("name is null when Auth0 name equals email", async () => {
    // Default mock already returns name === email
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0].name).toBeNull();
  });

  test("name is preserved when Auth0 name differs from email", async () => {
    mockFetchAuth0UserInfo.mockImplementationOnce(() =>
      Promise.resolve({
        sub: NEW_USER_SUB,
        email: "jane@example.com",
        name: "Jane Doe",
      }),
    );

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0].name).toBe("Jane Doe");
  });

  test("placeholder email used when Auth0 has no email", async () => {
    mockFetchAuth0UserInfo.mockImplementationOnce(() =>
      Promise.resolve({
        sub: NEW_USER_SUB,
      }),
    );

    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0].email).toBe(`${NEW_USER_SUB}@placeholder.local`);
  });

  test("provisioned user is not super-admin by default", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.isSuperAdmin).toBe(false);
  });

  test("provisioning runs inside a transaction", async () => {
    await app.request("/test", {
      headers: { Authorization: `Bearer ${NEW_USER_TOKEN}` },
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  test("returns 401 for invalid token, no provisioning", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer garbage-token" },
    });

    expect(res.status).toBe(401);
    expect(mockFetchAuth0UserInfo).not.toHaveBeenCalled();
    expect(insertedUsers).toHaveLength(0);
  });
});
