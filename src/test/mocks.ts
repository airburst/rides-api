/**
 * Mock Database and External Dependencies
 *
 * Provides mock implementations of database queries
 * and external services for testing.
 */

import { mock } from "bun:test";

/**
 * Mock database client
 * Provides mock implementations of Drizzle ORM methods
 */
export const createMockDb = () => ({
  query: {
    users: {
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
    },
    rides: {
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
    },
    userOnRides: {
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
    },
    repeatingRides: {
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
    },
  },
  insert: mock(() => Promise.resolve({ returning: [] })),
  update: mock(() => Promise.resolve({ returning: [] })),
  delete: mock(() => Promise.resolve({ returning: [] })),
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => Promise.resolve([])),
      leftJoin: mock(() => ({
        where: mock(() => Promise.resolve([])),
      })),
    })),
  })),
});

/**
 * Mock Hono context
 * Creates a minimal context object for testing route handlers
 */
export function createMockContext(overrides?: {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  user?: {
    id: string;
    auth0Id: string;
    role: string;
    name: string;
    email: string;
  };
}) {
  return {
    req: {
      json: mock(() => Promise.resolve(overrides?.body ?? {})),
      param: mock((key: string) => overrides?.params?.[key]),
      query: mock((key: string) => overrides?.query?.[key]),
      header: mock((key: string) => overrides?.headers?.[key]),
    },
    json: mock((data: unknown, status?: number) => ({
      data,
      status: status ?? 200,
    })),
    text: mock((text: string, status?: number) => ({
      text,
      status: status ?? 200,
    })),
    get: mock((key: string) => {
      if (key === "user") return overrides?.user;
      return undefined;
    }),
    set: mock(() => {}),
  };
}

/**
 * Reset all mocks
 * Call this in beforeEach to ensure clean state
 */
export function resetAllMocks() {
  // Bun test automatically resets mocks created with mock()
  // This is here for manual cleanup if needed
}
