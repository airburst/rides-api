import pkg from "rrule";
const { RRule } = pkg;

interface RepeatingRideDb {
  id?: string;
  name: string;
  schedule: string;
  winterStartTime?: string | null;
  rideGroup?: string | null;
  destination?: string | null;
  distance?: number | null;
  meetPoint?: string | null;
  route?: string | null;
  leader?: string | null;
  notes?: string | null;
  rideLimit?: number;
}

interface TemplateRide {
  name: string;
  rideDate: string;
  destination?: string | null;
  rideGroup?: string | null;
  distance?: number | null;
  meetPoint?: string | null;
  route?: string | null;
  leader?: string | null;
  notes?: string | null;
  rideLimit?: number;
  scheduleId?: string;
}

interface RideSet {
  id?: string;
  schedule: string;
  rides: TemplateRide[];
}

// Check if date is in winter (Nov-Feb)
export const isWinter = (dateString: string): boolean => {
  const date = new Date(dateString);
  const month = date.getMonth();
  return month >= 10 || month < 2; // Nov=10, Dec=11, Jan=0, Feb=1
};

// Change time for winter rides
const changeToWinterTime = (
  dateTime: Date,
  winterStartTime: string,
): string => {
  const dateString = dateTime.toISOString();

  if (!isWinter(dateString)) {
    return dateString;
  }

  const [hours, minutes] = winterStartTime.split(":");

  if (hours) {
    dateTime.setHours(+hours);
  }
  if (minutes) {
    dateTime.setMinutes(+minutes);
  }

  return dateTime.toISOString();
};

// Generate a single ride from template
const generateRide = (
  {
    id,
    name,
    destination,
    rideGroup,
    distance,
    meetPoint,
    route,
    leader,
    notes,
    rideLimit,
  }: RepeatingRideDb,
  date: string,
): TemplateRide => {
  const ride = {
    name,
    rideDate: date,
    destination,
    rideGroup,
    distance,
    meetPoint,
    route,
    leader,
    notes,
    rideLimit,
    scheduleId: id,
  };

  return Object.fromEntries(
    Object.entries(ride).filter(
      ([, val]) => val !== undefined && val !== null && val !== "",
    ),
  ) as unknown as TemplateRide;
};

// Get next month date
const getNextMonth = (date?: string): string => {
  const now = date ? new Date(date) : new Date();
  now.setMonth(now.getMonth() + 1);
  now.setDate(1);
  return now.toISOString();
};

// Generate rides for period from template
export const makeRidesInPeriod = (
  template: RepeatingRideDb,
  date?: string,
): RideSet => {
  const { id, schedule } = template;
  const start = date ? new Date(date) : new Date();
  const nextMonth = getNextMonth(date);
  const end = new Date(nextMonth);
  const rideDates = RRule.fromString(schedule).between(start, end);

  // Update timings if winterStartTime is set
  const winterStartTime = template.winterStartTime;
  const rides =
    typeof winterStartTime === "string"
      ? rideDates.map((r) =>
          generateRide(template, changeToWinterTime(r, winterStartTime)),
        )
      : rideDates.map((r) => generateRide(template, r.toISOString()));

  return {
    id,
    schedule,
    rides,
  };
};

// Update rrule start date after generating rides
export const updateRRuleStartDate = (
  schedule: string,
  startDate?: string,
): string => {
  if (!startDate) {
    return schedule;
  }

  const rrule = RRule.fromString(schedule);
  const { freq, interval, byweekday, bysetpos, bymonth, bymonthday, until } =
    rrule.options;

  const dtstart = new Date(startDate.valueOf());

  const updatedSchedule = new RRule({
    freq,
    dtstart,
    until,
    interval,
    byweekday,
    bysetpos,
    bymonth,
    bymonthday,
  });

  return updatedSchedule.toString();
};

export type { RepeatingRideDb, RideSet, TemplateRide };
