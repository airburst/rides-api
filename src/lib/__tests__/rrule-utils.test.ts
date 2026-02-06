/**
 * RRule Utilities Tests
 *
 * Tests for ride generation from RRule schedules, winter time adjustments,
 * and RRule manipulation functions.
 */

import { describe, expect, test } from "bun:test";
import type { RepeatingRideDb } from "../rrule-utils";
import { makeRidesInPeriod, updateRRuleStartDate } from "../rrule-utils";

/**
 * Helper to create a test template
 */
function createTemplate(overrides?: Partial<RepeatingRideDb>): RepeatingRideDb {
  return {
    id: "template-123",
    name: "Weekly Test Ride",
    schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T090000",
    winterStartTime: null,
    rideGroup: "A",
    destination: "Test Destination",
    distance: 30,
    meetPoint: "Village Hall",
    route: "Test Route",
    leader: "leader-123",
    notes: "Test notes",
    rideLimit: 20,
    ...overrides,
  };
}

describe("RRule Utilities", () => {
  describe("makeRidesInPeriod", () => {
    test("generates rides for weekly schedule", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260301T090000",
      });

      // March 2026 has 4 Saturdays (7, 14, 21, 28)
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(4);
      expect(result.id).toBe("template-123");
      expect(result.schedule).toBe(template.schedule);
    });

    test("generates rides for multiple days per week", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;DTSTART=20260301T090000",
      });

      // March 2026: Mon(2,9,16,23,30)=5, Wed(4,11,18,25)=4, Fri(6,13,20,27)=4 = 13 total
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(13);
    });

    test("generates correct ride properties", () => {
      const template = createTemplate({
        name: "Saturday Ride",
        destination: "Countryside",
        distance: 45,
        leader: "leader-456",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide?.name).toBe("Saturday Ride");
      expect(firstRide?.destination).toBe("Countryside");
      expect(firstRide?.distance).toBe(45);
      expect(firstRide?.leader).toBe("leader-456");
      expect(firstRide?.scheduleId).toBe("template-123");
    });

    test("excludes null and undefined fields from rides", () => {
      const template = createTemplate({
        destination: null,
        route: null,
        notes: null,
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        expect(firstRide.destination).toBeUndefined();
        expect(firstRide.route).toBeUndefined();
        expect(firstRide.notes).toBeUndefined();
      }
    });

    test("handles rides starting mid-month", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260315T090000",
      });

      // Starting March 15, only 2 Saturdays in March (21, 28)
      const result = makeRidesInPeriod(template, "2026-03-15T00:00:00.000Z");

      expect(result.rides.length).toBe(2);
    });

    test("respects RRule UNTIL date", () => {
      const template = createTemplate({
        schedule:
          "FREQ=WEEKLY;BYDAY=SA;UNTIL=20260315T090000;DTSTART=20260301T090000",
      });

      // March 2026: Saturdays on 7, 14 (but 21, 28 excluded by UNTIL)
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(2);
    });

    test("generates rides for daily schedule", () => {
      const template = createTemplate({
        schedule: "FREQ=DAILY;DTSTART=20260301T090000",
      });

      // March has 31 days
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(31);
    });
  });

  describe("Winter Time Adjustments", () => {
    test("applies winter time in October", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20261001T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-10-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
        expect(rideDate.getUTCMinutes()).toBe(30);
      }
    });

    test("applies winter time in November", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20261101T090000",
        winterStartTime: "08:00",
      });

      const result = makeRidesInPeriod(template, "2026-11-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
      }
    });

    test("applies winter time in December", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20261201T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-12-01T00:00:00.000Z");

      expect(result.rides.length).toBeGreaterThan(0);
      const firstRide = result.rides[0];
      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
        expect(rideDate.getUTCMinutes()).toBe(30);
      }
    });

    test("applies winter time in January", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-01-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
        expect(rideDate.getUTCMinutes()).toBe(30);
      }
    });

    test("applies winter time in February", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260201T090000",
        winterStartTime: "08:00",
      });

      const result = makeRidesInPeriod(template, "2026-02-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
      }
    });

    test("applies winter time in March", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260301T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(8);
        expect(rideDate.getUTCMinutes()).toBe(30);
      }
    });

    test("does NOT apply winter time in April (summer)", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260401T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-04-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        // Should keep original time (09:00)
        expect(rideDate.getUTCHours()).toBe(9);
        expect(rideDate.getUTCMinutes()).toBe(0);
      }
    });

    test("does NOT apply winter time in July (summer)", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260701T090000",
        winterStartTime: "08:00",
      });

      const result = makeRidesInPeriod(template, "2026-07-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(9);
      }
    });

    test("does NOT apply winter time in September (summer)", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260901T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-09-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(9);
      }
    });

    test("handles null winterStartTime gracefully", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20261201T090000",
        winterStartTime: null,
      });

      const result = makeRidesInPeriod(template, "2026-12-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        // Should keep original time
        expect(rideDate.getUTCHours()).toBe(9);
      }
    });
  });

  describe("updateRRuleStartDate", () => {
    test("updates DTSTART in RRule string", () => {
      const schedule = "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T090000";
      const newDate = new Date("2026-02-15T00:00:00.000Z");

      const result = updateRRuleStartDate(schedule, newDate.toISOString());

      expect(result).toContain("DTSTART:202602");
    });

    test("preserves other RRule parameters", () => {
      const schedule =
        "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1;DTSTART=20260101T090000";
      const newDate = new Date("2026-03-01T00:00:00.000Z");

      const result = updateRRuleStartDate(schedule, newDate.toISOString());

      expect(result).toContain("FREQ=WEEKLY");
      expect(result).toContain("BYDAY=MO,WE,FR");
      expect(result).toContain("INTERVAL=1");
    });

    test("preserves UNTIL parameter", () => {
      const schedule =
        "FREQ=WEEKLY;BYDAY=SA;UNTIL=20261231T090000;DTSTART=20260101T090000";
      const newDate = new Date("2026-02-01T00:00:00.000Z");

      const result = updateRRuleStartDate(schedule, newDate.toISOString());

      expect(result).toContain("UNTIL=20261231");
    });

    test("returns original schedule when no start date provided", () => {
      const schedule = "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T090000";

      const result = updateRRuleStartDate(schedule, undefined);

      expect(result).toBe(schedule);
    });

    test("adds one day to start date", () => {
      const schedule = "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260301T090000";
      const startDate = new Date("2026-03-15T00:00:00.000Z");

      const result = updateRRuleStartDate(schedule, startDate.toISOString());

      // Should be March 16 (15 + 1 day)
      expect(result).toContain("DTSTART:20260316");
    });
  });

  describe("Edge Cases", () => {
    test("handles month with 5 occurrences of same weekday", () => {
      const template = createTemplate({
        // March 2026 has 5 Mondays (2, 9, 16, 23, 30)
        schedule: "FREQ=WEEKLY;BYDAY=MO;DTSTART=20260301T090000",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(5);
    });

    test("handles February in leap year", () => {
      const template = createTemplate({
        schedule: "FREQ=DAILY;DTSTART=20240201T090000",
      });

      // 2024 is a leap year, February has 29 days
      const result = makeRidesInPeriod(template, "2024-02-01T00:00:00.000Z");

      expect(result.rides.length).toBe(29);
    });

    test("handles February in non-leap year", () => {
      const template = createTemplate({
        schedule: "FREQ=DAILY;DTSTART=20260201T090000",
      });

      // 2026 is not a leap year, February has 28 days
      const result = makeRidesInPeriod(template, "2026-02-01T00:00:00.000Z");

      expect(result.rides.length).toBe(28);
    });

    test("handles monthly schedule", () => {
      const template = createTemplate({
        // First Saturday of each month
        schedule: "FREQ=MONTHLY;BYDAY=1SA;DTSTART=20260301T090000",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      // Only 1 ride in March (first Saturday)
      expect(result.rides.length).toBe(1);
    });
  });
});
