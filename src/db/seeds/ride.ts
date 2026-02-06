import type { Db } from "../index.js";
import { rides } from "../schema/index.js";
import rideData from "./data/rides.json" with { type: "json" };

const DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

const getDay = (name: string) => {
  switch (name) {
    case "Sunday Ride":
      return DAYS.SUNDAY;
    case "Tuesday Ride":
      return DAYS.TUESDAY;
    case "Wednesday Social":
      return DAYS.WEDNESDAY;
    case "Thursday Beer and Pizza":
      return DAYS.THURSDAY;
    case "Friday Women (Shorter)":
      return DAYS.FRIDAY;
    default:
      return DAYS.SATURDAY;
  }
};

const findNextDay = (dayOfWeek: number, daysInAdvance = 0): string => {
  const today = new Date();
  today.setDate(today.getDate() + daysInAdvance);
  const currentDay = today.getDay();
  const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7;
  today.setDate(today.getDate() + daysUntil);
  return today.toISOString();
};

const getTimeFromDate = (date: string) => {
  const parts = date.split("T");
  return parts[1];
};

export default async function seed(db: Db) {
  const ridesWithFutureDates = rideData.map((ride, index) => {
    const daysInAdvance = index > 17 ? 7 : 0;
    const day = getDay(ride.name);
    const date = findNextDay(day, daysInAdvance);
    const rideDate = date.split("T")[0] + "T" + getTimeFromDate(ride.rideDate);

    return {
      ...ride,
      rideDate,
    };
  });

  await db.insert(rides).values(ridesWithFutureDates);
}
