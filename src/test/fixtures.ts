/**
 * Test Data Fixtures
 * 
 * Factory functions to create consistent test data
 * for users, rides, repeating rides, etc.
 */

import type { Role } from "../db/schema";

/**
 * Create a test user
 */
export function createTestUser(overrides?: {
  id?: string;
  auth0Id?: string;
  name?: string;
  email?: string;
  role?: Role;
  mobile?: string;
  emergencyName?: string | null;
  emergencyMobile?: string | null;
}) {
  return {
    id: overrides?.id ?? "user-123",
    auth0Id: overrides?.auth0Id ?? "auth0|user123",
    name: overrides?.name ?? "Test User",
    email: overrides?.email ?? "test@example.com",
    role: overrides?.role ?? ("USER" as Role),
    mobile: overrides?.mobile ?? "1234567890",
    emergencyName: overrides?.emergencyName ?? null,
    emergencyMobile: overrides?.emergencyMobile ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a test ride
 */
export function createTestRide(overrides?: {
  id?: string;
  name?: string;
  group?: string;
  date?: string;
  time?: string;
  meetPoint?: string;
  destination?: string | null;
  distance?: string | null;
  leader?: string;
  route?: string | null;
  scheduleId?: string | null;
  maxRiders?: number | null;
  notes?: string | null;
  deleted?: boolean;
}) {
  return {
    id: overrides?.id ?? "ride-123",
    name: overrides?.name ?? "Test Ride",
    group: overrides?.group ?? "A",
    date: overrides?.date ?? "2026-03-15",
    time: overrides?.time ?? "09:00",
    meetPoint: overrides?.meetPoint ?? "Village Hall",
    destination: overrides?.destination ?? "Countryside",
    distance: overrides?.distance ?? "30 miles",
    leader: overrides?.leader ?? "user-123",
    route: overrides?.route ?? null,
    scheduleId: overrides?.scheduleId ?? null,
    maxRiders: overrides?.maxRiders ?? null,
    notes: overrides?.notes ?? null,
    deleted: overrides?.deleted ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a test repeating ride template
 */
export function createTestRepeatingRide(overrides?: {
  id?: string;
  name?: string;
  group?: string;
  schedule?: string;
  winterStartTime?: string | null;
  meetPoint?: string;
  destination?: string | null;
  distance?: string | null;
  leader?: string;
  route?: string | null;
  rrule?: string;
  maxRiders?: number | null;
  notes?: string | null;
}) {
  return {
    id: overrides?.id ?? "schedule-123",
    name: overrides?.name ?? "Weekly Ride",
    group: overrides?.group ?? "A",
    schedule: overrides?.schedule ?? "09:00",
    winterStartTime: overrides?.winterStartTime ?? null,
    meetPoint: overrides?.meetPoint ?? "Village Hall",
    destination: overrides?.destination ?? "Countryside",
    distance: overrides?.distance ?? "30 miles",
    leader: overrides?.leader ?? "user-123",
    route: overrides?.route ?? null,
    rrule: overrides?.rrule ?? "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T090000",
    maxRiders: overrides?.maxRiders ?? null,
    notes: overrides?.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a test user-ride join record
 */
export function createTestUserOnRide(overrides?: {
  userId?: string;
  rideId?: string;
}) {
  return {
    userId: overrides?.userId ?? "user-123",
    rideId: overrides?.rideId ?? "ride-123",
  };
}

/**
 * Create multiple test users with different roles
 */
export function createTestUsers() {
  return {
    user: createTestUser({
      id: "user-1",
      auth0Id: "auth0|user1",
      name: "Regular User",
      role: "USER",
    }),
    leader: createTestUser({
      id: "leader-1",
      auth0Id: "auth0|leader1",
      name: "Ride Leader",
      role: "LEADER",
    }),
    admin: createTestUser({
      id: "admin-1",
      auth0Id: "auth0|admin1",
      name: "Admin User",
      role: "ADMIN",
    }),
  };
}

/**
 * Create a test ride with participants
 */
export function createTestRideWithParticipants(rideOverrides?: Parameters<typeof createTestRide>[0]) {
  const ride = createTestRide(rideOverrides);
  const users = createTestUsers();
  
  return {
    ride,
    participants: [
      createTestUserOnRide({ userId: users.user.id, rideId: ride.id }),
      createTestUserOnRide({ userId: users.leader.id, rideId: ride.id }),
    ],
    users,
  };
}
