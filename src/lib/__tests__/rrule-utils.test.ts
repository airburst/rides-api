/**
 * RRule Utilities Tests
 *
 * Tests for ride generation from RRule schedules, winter time adjustments,
 * and RRule manipulation functions.
 */

import { describe, expect, test } from "bun:test";
import type { RepeatingRideDb } from "../rrule-utils";
import {
  filterExistingRides,
  isWinter,
  makeRidesInPeriod,
  updateRRuleStartDate,
} from "../rrule-utils";
import type { TemplateRide } from "../rrule-utils";

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

      // Window = [start, end of next month): Mar (4) + Apr (4) Saturdays = 8
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(8);
      expect(result.id).toBe("template-123");
      expect(result.schedule).toBe(template.schedule);
    });

    test("generates rides for multiple days per week", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;DTSTART=20260301T090000",
      });

      // Window Mar+Apr 2026: March 13 + April (Mon 4, Wed 5, Fri 4 = 13) = 26
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(26);
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

      // From Mar 15 through end of Apr: Mar (21, 28) + Apr (4 Saturdays) = 6
      const result = makeRidesInPeriod(template, "2026-03-15T00:00:00.000Z");

      expect(result.rides.length).toBe(6);
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

      // Window Mar+Apr 2026: 31 + 30 = 61 days
      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      expect(result.rides.length).toBe(61);
    });
  });

  describe("Winter Time Adjustments", () => {
    test("does NOT apply winter time in October", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20261001T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-10-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(9);
        expect(rideDate.getUTCMinutes()).toBe(0);
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

    test("does NOT apply winter time in March", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260301T090000",
        winterStartTime: "08:30",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");
      const firstRide = result.rides[0];

      expect(firstRide).toBeDefined();
      if (firstRide) {
        const rideDate = new Date(firstRide.rideDate);
        expect(rideDate.getUTCHours()).toBe(9);
        expect(rideDate.getUTCMinutes()).toBe(0);
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

    test("uses exact start date without offset", () => {
      const schedule = "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260301T090000";
      const startDate = new Date("2026-03-15T00:00:00.000Z");

      const result = updateRRuleStartDate(schedule, startDate.toISOString());

      expect(result).toContain("DTSTART:20260315");
    });
  });

  describe("Edge Cases", () => {
    test("handles month with 5 occurrences of same weekday", () => {
      const template = createTemplate({
        // March 2026 has 5 Mondays (2, 9, 16, 23, 30)
        schedule: "FREQ=WEEKLY;BYDAY=MO;DTSTART=20260301T090000",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      // Window Mar+Apr: 5 March Mondays + 4 April Mondays = 9
      expect(result.rides.length).toBe(9);
    });

    test("handles February in leap year", () => {
      const template = createTemplate({
        schedule: "FREQ=DAILY;DTSTART=20240201T090000",
      });

      // Window Feb+Mar 2024 (leap): 29 + 31 = 60 days
      const result = makeRidesInPeriod(template, "2024-02-01T00:00:00.000Z");

      expect(result.rides.length).toBe(60);
    });

    test("handles February in non-leap year", () => {
      const template = createTemplate({
        schedule: "FREQ=DAILY;DTSTART=20260201T090000",
      });

      // Window Feb+Mar 2026 (non-leap): 28 + 31 = 59 days
      const result = makeRidesInPeriod(template, "2026-02-01T00:00:00.000Z");

      expect(result.rides.length).toBe(59);
    });

    test("handles monthly schedule", () => {
      const template = createTemplate({
        // First Saturday of each month
        schedule: "FREQ=MONTHLY;BYDAY=1SA;DTSTART=20260301T090000",
      });

      const result = makeRidesInPeriod(template, "2026-03-01T00:00:00.000Z");

      // First Saturday of March + first Saturday of April = 2
      expect(result.rides.length).toBe(2);
    });
  });

  describe("isWinter", () => {
    test("returns false for October", () => {
      expect(isWinter("2023-10-15T10:00:00.000Z")).toBe(false);
    });

    test("returns true for November", () => {
      expect(isWinter("2023-11-15T10:00:00.000Z")).toBe(true);
    });

    test("returns true for December", () => {
      expect(isWinter("2023-12-15T10:00:00.000Z")).toBe(true);
    });

    test("returns true for January", () => {
      expect(isWinter("2023-01-15T10:00:00.000Z")).toBe(true);
    });

    test("returns true for February", () => {
      expect(isWinter("2023-02-15T10:00:00.000Z")).toBe(true);
    });

    test("returns false for March", () => {
      expect(isWinter("2023-03-15T10:00:00.000Z")).toBe(false);
    });

    test("returns false for July", () => {
      expect(isWinter("2023-07-15T10:00:00.000Z")).toBe(false);
    });
  });

  describe("Idempotency and round-trip", () => {
    test("makeRidesInPeriod is idempotent", () => {
      const template = createTemplate({
        schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260503T080000",
      });

      const first = makeRidesInPeriod(template, "2026-05-03T00:00:00.000Z");
      const second = makeRidesInPeriod(template, "2026-05-03T00:00:00.000Z");

      expect(second.rides).toEqual(first.rides);
    });

    test("updateRRuleStartDate preserves time component", () => {
      const schedule = "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260101T083000";

      const result = updateRRuleStartDate(schedule, "2026-03-03T08:30:00.000Z");

      expect(result).toContain("DTSTART:20260303T083000Z");
    });
  });

  describe("filterExistingRides (idempotency)", () => {
    const template = createTemplate({
      schedule: "FREQ=WEEKLY;BYDAY=SA;DTSTART=20260307T090000",
    });
    const rideList: TemplateRide[] = makeRidesInPeriod(
      template,
      "2026-03-01T00:00:00.000Z",
    ).rides;

    test("returns all rides when none exist yet", () => {
      expect(filterExistingRides(rideList, [])).toEqual(rideList);
    });

    test("returns none when every occurrence already exists", () => {
      const existing = rideList.map((r) => r.rideDate);
      expect(filterExistingRides(rideList, existing)).toHaveLength(0);
    });

    test("returns only the occurrences not yet created", () => {
      // Pretend the first two were already generated.
      const existing = rideList.slice(0, 2).map((r) => r.rideDate);
      const result = filterExistingRides(rideList, existing);
      expect(result).toHaveLength(rideList.length - 2);
      expect(result).toEqual(rideList.slice(2));
    });

    test("matches by timestamp value, not string format (Postgres style)", () => {
      // DB may return "2026-03-07 09:00:00+00" instead of ISO; must still match.
      const first = rideList[0]?.rideDate as string;
      const pgFormat = first.replace("T", " ").replace(".000Z", "+00");
      const result = filterExistingRides(rideList, [pgFormat]);
      expect(result).toHaveLength(rideList.length - 1);
      expect(result.map((r) => r.rideDate)).not.toContain(first);
    });
  });
});
