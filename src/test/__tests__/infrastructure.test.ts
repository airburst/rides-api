/**
 * Infrastructure Test
 * Verifies that test utilities are working correctly
 */

import { describe, test, expect } from "bun:test";
import {
  TEST_TOKENS,
  TEST_USERS,
  createAuthHeader,
  createInvalidAuthHeader,
  getTestUser,
} from "../auth";
import {
  createTestUser,
  createTestRide,
  createTestRepeatingRide,
  createTestUsers,
} from "../fixtures";
import { createMockDb, createMockContext } from "../mocks";
import { assertResponse, createTestDate, formatDate } from "../helpers";

describe("Test Infrastructure", () => {
  describe("Auth Utilities", () => {
    test("TEST_TOKENS are defined", () => {
      expect(TEST_TOKENS.USER).toBeDefined();
      expect(TEST_TOKENS.LEADER).toBeDefined();
      expect(TEST_TOKENS.ADMIN).toBeDefined();
      expect(TEST_TOKENS.INVALID).toBeDefined();
    });

    test("TEST_USERS have correct roles", () => {
      expect(TEST_USERS.USER.role).toBe("USER");
      expect(TEST_USERS.LEADER.role).toBe("LEADER");
      expect(TEST_USERS.ADMIN.role).toBe("ADMIN");
    });

    test("createAuthHeader creates Bearer token", () => {
      const header = createAuthHeader("USER");
      expect(header.Authorization).toContain("Bearer");
      expect(header.Authorization).toContain(TEST_TOKENS.USER);
    });

    test("createInvalidAuthHeader creates invalid token", () => {
      const header = createInvalidAuthHeader("INVALID");
      expect(header.Authorization).toContain(TEST_TOKENS.INVALID);
    });

    test("getTestUser returns correct user", () => {
      const user = getTestUser("ADMIN");
      expect(user.role).toBe("ADMIN");
      expect(user.id).toBe(TEST_USERS.ADMIN.id);
    });
  });

  describe("Fixtures", () => {
    test("createTestUser creates valid user", () => {
      const user = createTestUser();
      expect(user.id).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.role).toBeDefined();
    });

    test("createTestUser accepts overrides", () => {
      const user = createTestUser({ name: "Custom Name", role: "LEADER" });
      expect(user.name).toBe("Custom Name");
      expect(user.role).toBe("LEADER");
    });

    test("createTestRide creates valid ride", () => {
      const ride = createTestRide();
      expect(ride.id).toBeDefined();
      expect(ride.name).toBeDefined();
      expect(ride.date).toBeDefined();
      expect(ride.deleted).toBe(false);
    });

    test("createTestRepeatingRide creates valid template", () => {
      const template = createTestRepeatingRide();
      expect(template.id).toBeDefined();
      expect(template.rrule).toBeDefined();
      expect(template.schedule).toBeDefined();
    });

    test("createTestUsers creates all roles", () => {
      const users = createTestUsers();
      expect(users.user.role).toBe("USER");
      expect(users.leader.role).toBe("LEADER");
      expect(users.admin.role).toBe("ADMIN");
    });
  });

  describe("Mocks", () => {
    test("createMockDb creates database mock", () => {
      const db = createMockDb();
      expect(db.query).toBeDefined();
      expect(db.insert).toBeDefined();
      expect(db.update).toBeDefined();
      expect(db.delete).toBeDefined();
    });

    test("createMockContext creates Hono context", () => {
      const ctx = createMockContext();
      expect(ctx.req).toBeDefined();
      expect(ctx.json).toBeDefined();
      expect(ctx.text).toBeDefined();
    });

    test("createMockContext accepts overrides", () => {
      const ctx = createMockContext({
        params: { id: "123" },
        user: TEST_USERS.ADMIN,
      });
      expect(ctx.req.param("id")).toBe("123");
      expect(ctx.get("user")).toEqual(TEST_USERS.ADMIN);
    });
  });

  describe("Helpers", () => {
    test("formatDate formats date correctly", () => {
      const date = new Date("2026-03-15T12:00:00Z");
      expect(formatDate(date)).toBe("2026-03-15");
    });

    test("createTestDate creates future date", () => {
      const futureDate = createTestDate(7);
      expect(futureDate).toBeDefined();
      expect(futureDate.length).toBe(10); // YYYY-MM-DD format
    });

    test("assertResponse validates response", () => {
      const response = { status: 200, data: { success: true } };
      assertResponse(response, 200, { success: true });
    });
  });
});
