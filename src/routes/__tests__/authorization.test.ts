/**
 * Authorization Tests - CRITICAL SECURITY TESTS
 *
 * Tests role-based access control across ALL API endpoints.
 * Every endpoint MUST be tested with every role combination.
 *
 * This is the MOST IMPORTANT test file - authorization bugs can expose all data.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { TEST_TOKENS, TEST_USERS } from "../../test/auth.js";

// Mock environment variables for testing
process.env.API_KEY = "test-api-key-12345";
process.env.AUTH0_DOMAIN = "test.auth0.com";
process.env.AUTH0_AUDIENCE = "https://test-api.example.com";

// Create a mapping of auth0 IDs to user data for easier lookup
const usersByAuth0Id: Record<string, any> = {
  [TEST_USERS.USER.auth0Id]: {
    providerAccountId: TEST_USERS.USER.auth0Id,
    users: TEST_USERS.USER,
  },
  [TEST_USERS.LEADER.auth0Id]: {
    providerAccountId: TEST_USERS.LEADER.auth0Id,
    users: TEST_USERS.LEADER,
  },
  [TEST_USERS.ADMIN.auth0Id]: {
    providerAccountId: TEST_USERS.ADMIN.auth0Id,
    users: TEST_USERS.ADMIN,
  },
};

// Keep track of the last auth0 ID requested for mocking
let lastRequestedAuth0Id: string | null = null;

// Mock database module BEFORE importing routes
const mockDbQuery = {
  accounts: {
    findFirst: mock(() => {
      // Return the user based on lastRequestedAuth0Id
      if (lastRequestedAuth0Id && usersByAuth0Id[lastRequestedAuth0Id]) {
        return Promise.resolve(usersByAuth0Id[lastRequestedAuth0Id]);
      }
      return Promise.resolve(null);
    }),
  },
  users: {
    findFirst: mock(() => Promise.resolve(null as any)),
    findMany: mock(() => Promise.resolve([] as any[])),
  },
  rides: {
    findFirst: mock(() => Promise.resolve(null as any)),
    findMany: mock(() => Promise.resolve([] as any[])),
  },
  userOnRides: {
    findFirst: mock(() => Promise.resolve(null as any)),
    findMany: mock(() => Promise.resolve([] as any[])),
  },
  repeatingRides: {
    findFirst: mock(() => Promise.resolve(null as any)),
    findMany: mock(() => Promise.resolve([] as any[])),
  },
};

const mockDb = {
  query: mockDbQuery,
  insert: mock(() => ({
    values: mock(() => Promise.resolve()),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => Promise.resolve([])),
      innerJoin: mock(() => ({
        where: mock(() => Promise.resolve([])),
      })),
    })),
  })),
  transaction: mock((cb) => cb(mockDb)),
  execute: mock(() => Promise.resolve([])),
};

mock.module("../../db/index.js", () => ({ db: mockDb }));

// Mock verifyAuth0Token BEFORE importing routes
const mockVerifyAuth0Token = mock((token: string) => {
  switch (token) {
    case TEST_TOKENS.USER:
      lastRequestedAuth0Id = TEST_USERS.USER.auth0Id;
      return Promise.resolve({ sub: TEST_USERS.USER.auth0Id });
    case TEST_TOKENS.LEADER:
      lastRequestedAuth0Id = TEST_USERS.LEADER.auth0Id;
      return Promise.resolve({ sub: TEST_USERS.LEADER.auth0Id });
    case TEST_TOKENS.ADMIN:
      lastRequestedAuth0Id = TEST_USERS.ADMIN.auth0Id;
      return Promise.resolve({ sub: TEST_USERS.ADMIN.auth0Id });
    case TEST_TOKENS.INVALID:
    case TEST_TOKENS.EXPIRED:
      return Promise.reject(new Error("Invalid token"));
    default:
      return Promise.reject(new Error("Unknown token"));
  }
});

mock.module("../../lib/auth0.js", () => ({
  verifyAuth0Token: mockVerifyAuth0Token,
}));

// NOW import routes (after mocks are in place)
const { ridesRouter } = await import("../rides.js");
const { repeatingRidesRouter } = await import("../repeating-rides.js");
const { usersRouter } = await import("../users.js");
const { generateRouter } = await import("../generate.js");
const { archiveRouter } = await import("../archive.js");

// Create test app with all routes
const app = new Hono();
app.route("/rides", ridesRouter);
app.route("/repeating-rides", repeatingRidesRouter);
app.route("/users", usersRouter);
app.route("/generate", generateRouter);
app.route("/archive", archiveRouter);

beforeEach(() => {
  // Reset mocks
  mockVerifyAuth0Token.mockClear();
  lastRequestedAuth0Id = null;

  // Mock rides query to return empty results
  mockDbQuery.rides.findMany.mockResolvedValue([]);
  mockDbQuery.rides.findFirst.mockResolvedValue({
    id: "test-ride-id",
    name: "Test Ride",
    deleted: false,
  });

  // Mock repeating rides query
  mockDbQuery.repeatingRides.findMany.mockResolvedValue([]);
  mockDbQuery.repeatingRides.findFirst.mockResolvedValue({
    id: "test-schedule-id",
    name: "Test Schedule",
  });

  // Mock users query
  mockDbQuery.users.findMany.mockResolvedValue([]);
  mockDbQuery.users.findFirst.mockResolvedValue(TEST_USERS.USER);
});

describe("🔐 Authorization Tests (CRITICAL)", () => {
  describe("Rides Routes", () => {
    describe("GET /rides - List rides", () => {
      test("allows guests (no auth)", async () => {
        const response = await app.request("/rides");
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("rides");
      });

      test("allows authenticated USER", async () => {
        const response = await app.request("/rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("rides");
      });

      test("allows LEADER", async () => {
        const response = await app.request("/rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("rides");
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("rides");
      });
    });

    describe("GET /rides/:id - View ride", () => {
      test("allows guests (no auth)", async () => {
        const response = await app.request("/rides/test-ride-id");
        expect(response.status).toBe(200);
      });

      test("allows authenticated USER", async () => {
        const response = await app.request("/rides/test-ride-id", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("POST /rides - Create ride", () => {
      const validBody = {
        name: "Test Ride",
        rideDate: "2026-03-15T09:00:00Z",
        distance: 30,
      };

      test("rejects guests (401)", async () => {
        const response = await app.request("/rides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER role (403)", async () => {
        const response = await app.request("/rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(403);
      });

      test("allows LEADER role", async () => {
        const response = await app.request("/rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(201);
      });

      test("allows ADMIN role", async () => {
        const response = await app.request("/rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(201);
      });

      test("rejects invalid token (401)", async () => {
        const response = await app.request("/rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.INVALID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(401);
      });
    });

    describe("PUT /rides/:id - Update ride", () => {
      const updateBody = { name: "Updated Ride" };

      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER role (403)", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(403);
      });

      test("allows LEADER role", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });

      test("allows ADMIN role", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });
    });

    describe("DELETE /rides/:id - Delete ride", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "DELETE",
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER role (403)", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows LEADER role", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows ADMIN role", async () => {
        const response = await app.request("/rides/test-ride-id", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("POST /rides/:id/join - Join ride", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id/join", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("USER can join self only", async () => {
        const response = await app.request("/rides/test-ride-id/join", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
      });

      test("USER cannot add another user (403)", async () => {
        const response = await app.request("/rides/test-ride-id/join", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(403);
      });

      test("LEADER can add any user", async () => {
        const response = await app.request("/rides/test-ride-id/join", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can add any user", async () => {
        const response = await app.request("/rides/test-ride-id/join", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });
    });

    describe("POST /rides/:id/leave - Leave ride", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id/leave", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("USER can leave self only", async () => {
        const response = await app.request("/rides/test-ride-id/leave", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
      });

      test("USER cannot remove another user (403)", async () => {
        const response = await app.request("/rides/test-ride-id/leave", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(403);
      });

      test("LEADER can remove any user", async () => {
        const response = await app.request("/rides/test-ride-id/leave", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can remove any user", async () => {
        const response = await app.request("/rides/test-ride-id/leave", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });
    });

    describe("PATCH /rides/:id/notes - Update user notes", () => {
      const notesBody = { notes: "Test notes" };

      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id/notes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notesBody),
        });
        expect(response.status).toBe(401);
      });

      test("USER can update own notes only", async () => {
        const response = await app.request("/rides/test-ride-id/notes", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(notesBody),
        });
        expect(response.status).toBe(200);
      });

      test("USER cannot update another user's notes (403)", async () => {
        const response = await app.request("/rides/test-ride-id/notes", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...notesBody, userId: "other-user-id" }),
        });
        expect(response.status).toBe(403);
      });

      test("LEADER can update any user's notes", async () => {
        const response = await app.request("/rides/test-ride-id/notes", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...notesBody, userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can update any user's notes", async () => {
        const response = await app.request("/rides/test-ride-id/notes", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...notesBody, userId: "other-user-id" }),
        });
        expect(response.status).toBe(200);
      });
    });

    describe("POST /rides/:id/cancel - Cancel ride", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id/cancel", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request("/rides/test-ride-id/cancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows LEADER", async () => {
        const response = await app.request("/rides/test-ride-id/cancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/rides/test-ride-id/cancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("POST /rides/:id/uncancel - Uncancel ride", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/rides/test-ride-id/uncancel", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request("/rides/test-ride-id/uncancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows LEADER", async () => {
        const response = await app.request("/rides/test-ride-id/uncancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/rides/test-ride-id/uncancel", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Repeating Rides Routes - ADMIN ONLY", () => {
    describe("GET /repeating-rides - List templates", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/repeating-rides");
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request("/repeating-rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request("/repeating-rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/repeating-rides", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("GET /repeating-rides/:id - View template", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/repeating-rides/test-schedule-id");
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
          },
        );
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
          },
        );
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
          },
        );
        expect(response.status).toBe(200);
      });
    });

    describe("POST /repeating-rides - Create template", () => {
      const validBody = {
        name: "Weekly Group Ride",
        schedule: "Wednesday 09:00",
      };

      test("rejects guests (401)", async () => {
        const response = await app.request("/repeating-rides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request("/repeating-rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request("/repeating-rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/repeating-rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(201);
      });

      test("rejects invalid token (401)", async () => {
        const response = await app.request("/repeating-rides", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.INVALID}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        });
        expect(response.status).toBe(401);
      });
    });

    describe("PUT /repeating-rides/:id - Update template", () => {
      const updateBody = {
        name: "Updated Schedule",
        schedule: "Monday 10:00",
      };

      test("rejects guests (401)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updateBody),
          },
        );
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${TEST_TOKENS.USER}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updateBody),
          },
        );
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updateBody),
          },
        );
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updateBody),
          },
        );
        expect(response.status).toBe(200);
      });
    });

    describe("DELETE /repeating-rides/:id - Delete template", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "DELETE",
          },
        );
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
          },
        );
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
          },
        );
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request(
          "/repeating-rides/test-schedule-id",
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
          },
        );
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Users Routes", () => {
    describe("GET /users/me - Get own profile", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/users/me");
        expect(response.status).toBe(401);
      });

      test("allows USER", async () => {
        const response = await app.request("/users/me", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows LEADER", async () => {
        const response = await app.request("/users/me", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/users/me", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });

      test("rejects invalid token (401)", async () => {
        const response = await app.request("/users/me", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.INVALID}` },
        });
        expect(response.status).toBe(401);
      });
    });

    describe("GET /users - List all users", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/users");
        expect(response.status).toBe(401);
      });

      test("rejects USER (403)", async () => {
        const response = await app.request("/users", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("rejects LEADER (403)", async () => {
        const response = await app.request("/users", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows ADMIN", async () => {
        const response = await app.request("/users", {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("GET /users/:id - Get user by ID", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`);
        expect(response.status).toBe(401);
      });

      test("USER can view self", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(200);
      });

      test("USER cannot view other users (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("LEADER can view self", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(200);
      });

      test("LEADER cannot view other users (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(403);
      });

      test("ADMIN can view any user", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can view LEADER", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });
    });

    describe("PATCH /users/:id - Update user", () => {
      const updateBody = { name: "Updated Name" };

      test("rejects guests (401)", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(401);
      });

      test("USER can update self", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });

      test("USER cannot update other users (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(403);
      });

      test("USER cannot change own role (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.USER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "ADMIN" }),
        });
        expect(response.status).toBe(403);
      });

      test("LEADER can update self", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });

      test("LEADER cannot update other users (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(403);
      });

      test("LEADER cannot change own role (403)", async () => {
        const response = await app.request(`/users/${TEST_USERS.LEADER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.LEADER}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "ADMIN" }),
        });
        expect(response.status).toBe(403);
      });

      test("ADMIN can update any user", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can change user roles", async () => {
        const response = await app.request(`/users/${TEST_USERS.USER.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "LEADER" }),
        });
        expect(response.status).toBe(200);
      });

      test("ADMIN can update self", async () => {
        const response = await app.request(`/users/${TEST_USERS.ADMIN.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TEST_TOKENS.ADMIN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateBody),
        });
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Generate Route - API Key or ADMIN", () => {
    describe("POST /generate - Generate rides from templates", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/generate", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER JWT (403)", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(403);
      });

      test("rejects LEADER JWT (403)", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(403);
      });

      test("allows ADMIN JWT", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(200);
      });

      test("allows API key", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: "Bearer test-api-key-12345" },
        });
        expect(response.status).toBe(200);
      });

      test("rejects invalid API key (401)", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: "Bearer wrong-api-key" },
        });
        expect(response.status).toBe(401);
      });

      test("rejects invalid JWT (401)", async () => {
        const response = await app.request("/generate", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.INVALID}` },
        });
        expect(response.status).toBe(401);
      });
    });
  });

  describe("Archive Route - API Key Only", () => {
    describe("POST /archive - Archive old rides", () => {
      test("rejects guests (401)", async () => {
        const response = await app.request("/archive", {
          method: "POST",
        });
        expect(response.status).toBe(401);
      });

      test("rejects USER JWT (401)", async () => {
        const response = await app.request("/archive", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.USER}` },
        });
        expect(response.status).toBe(401);
      });

      test("rejects LEADER JWT (401)", async () => {
        const response = await app.request("/archive", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.LEADER}` },
        });
        expect(response.status).toBe(401);
      });

      test("rejects ADMIN JWT (401) - only API key allowed", async () => {
        const response = await app.request("/archive", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_TOKENS.ADMIN}` },
        });
        expect(response.status).toBe(401);
      });

      test("allows API key", async () => {
        const response = await app.request("/archive", {
          method: "POST",
          headers: { Authorization: "Bearer test-api-key-12345" },
        });
        expect(response.status).toBe(200);
      });

      test("rejects invalid API key (401)", async () => {
        const response = await app.request("/archive", {
          method: "POST",
          headers: { Authorization: "Bearer wrong-api-key" },
        });
        expect(response.status).toBe(401);
      });
    });
  });

  describe("Invalid/Expired Tokens", () => {
    test("rejects expired token (401)", async () => {
      const response = await app.request("/rides", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_TOKENS.EXPIRED}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Ride",
          rideDate: "2026-03-15T09:00:00Z",
          distance: 30,
        }),
      });
      expect(response.status).toBe(401);
    });

    test("rejects malformed Authorization header (401)", async () => {
      const response = await app.request("/rides", {
        method: "POST",
        headers: {
          Authorization: "InvalidFormat",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Ride",
          rideDate: "2026-03-15T09:00:00Z",
          distance: 30,
        }),
      });
      expect(response.status).toBe(401);
    });

    test("rejects missing Bearer prefix (401)", async () => {
      const response = await app.request("/rides", {
        method: "POST",
        headers: {
          Authorization: TEST_TOKENS.ADMIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Ride",
          rideDate: "2026-03-15T09:00:00Z",
          distance: 30,
        }),
      });
      expect(response.status).toBe(401);
    });
  });
});
