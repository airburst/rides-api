/**
 * Test Authentication Utilities
 *
 * Provides dummy auth tokens and mock functions for testing
 * protected routes without needing real JWT tokens.
 */

import { mock } from "bun:test";
import type { Role } from "../db/schema";

/**
 * Test tokens - simple strings that our mock understands
 * NOT real JWTs - just identifiers for testing
 */
export const TEST_TOKENS = {
  USER: "test-token-user",
  LEADER: "test-token-leader",
  ADMIN: "test-token-admin",
  INVALID: "test-token-invalid",
  EXPIRED: "test-token-expired",
};

/**
 * Test user data returned by mock auth verification
 */
export const TEST_USERS = {
  USER: {
    id: "test-user-id",
    auth0Id: "auth0|test-user",
    role: "USER" as Role,
    name: "Test User",
    email: "user@test.com",
    mobile: "1234567890",
  },
  LEADER: {
    id: "test-leader-id",
    auth0Id: "auth0|test-leader",
    role: "LEADER" as Role,
    name: "Test Leader",
    email: "leader@test.com",
    mobile: "0987654321",
  },
  ADMIN: {
    id: "test-admin-id",
    auth0Id: "auth0|test-admin",
    role: "ADMIN" as Role,
    name: "Test Admin",
    email: "admin@test.com",
    mobile: "5555555555",
  },
};

/**
 * Mocked verifyAuth0Token function
 * Maps test tokens to user data without real JWT verification
 *
 * @param token - Test token string
 * @returns User data with role
 * @throws Error for invalid/expired tokens
 */
export const mockVerifyAuth0Token = mock((token: string) => {
  switch (token) {
    case TEST_TOKENS.USER:
      return Promise.resolve(TEST_USERS.USER);
    case TEST_TOKENS.LEADER:
      return Promise.resolve(TEST_USERS.LEADER);
    case TEST_TOKENS.ADMIN:
      return Promise.resolve(TEST_USERS.ADMIN);
    case TEST_TOKENS.INVALID:
      throw new Error("Invalid token");
    case TEST_TOKENS.EXPIRED:
      throw new Error("Token expired");
    default:
      throw new Error("Unknown test token");
  }
});

/**
 * Helper to create Authorization header for requests
 *
 * @param role - User role (USER, LEADER, ADMIN)
 * @returns Headers object with Bearer token
 */
export function createAuthHeader(role: "USER" | "LEADER" | "ADMIN") {
  return {
    Authorization: `Bearer ${TEST_TOKENS[role]}`,
  };
}

/**
 * Helper to create invalid Authorization header
 *
 * @param type - Type of invalid token
 * @returns Headers object with invalid token
 */
export function createInvalidAuthHeader(
  type: "INVALID" | "EXPIRED" | "MISSING" = "INVALID",
) {
  if (type === "MISSING") {
    return {};
  }
  return {
    Authorization: `Bearer ${TEST_TOKENS[type]}`,
  };
}

/**
 * Get test user by role
 *
 * @param role - User role
 * @returns Test user object
 */
export function getTestUser(role: "USER" | "LEADER" | "ADMIN") {
  return TEST_USERS[role];
}
