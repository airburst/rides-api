/**
 * Test Helper Utilities
 * 
 * Common helper functions for testing
 */

import { expect } from "bun:test";

/**
 * Assert that a response has expected status and optional body
 */
export function assertResponse(
  response: { status: number; data?: unknown },
  expectedStatus: number,
  expectedBody?: unknown
) {
  expect(response.status).toBe(expectedStatus);
  if (expectedBody !== undefined) {
    expect(response.data).toEqual(expectedBody);
  }
}

/**
 * Assert that a response is an error with expected message
 */
export function assertErrorResponse(
  response: { status: number; data?: { error?: string; message?: string } },
  expectedStatus: number,
  expectedMessage?: string
) {
  expect(response.status).toBe(expectedStatus);
  if (expectedMessage) {
    const errorMessage = response.data?.error ?? response.data?.message;
    expect(errorMessage).toContain(expectedMessage);
  }
}

/**
 * Create a date string in YYYY-MM-DD format
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Create a date for testing (relative to today)
 */
export function createTestDate(daysOffset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatDate(date);
}

/**
 * Parse RRule string and extract specific parameter
 */
export function extractRRuleParam(rrule: string, param: string): string | null {
  const match = new RegExp(`${param}=([^;]+)`).exec(rrule);
  return match ? match[1] : null;
}

/**
 * Sleep for testing async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that an array contains items matching a predicate
 */
export function assertArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
) {
  const found = array.some(predicate);
  if (!found) {
    throw new Error(message ?? "Array does not contain expected item");
  }
}

/**
 * Assert that an array does not contain items matching a predicate
 */
export function assertArrayNotContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
) {
  const found = array.some(predicate);
  if (found) {
    throw new Error(message ?? "Array contains unexpected item");
  }
}
