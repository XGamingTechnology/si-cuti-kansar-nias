import { LeaveBalancePolicyError } from "./errors";

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

export const CALENDAR_OVERRIDE_TYPES = [
  "PUBLIC_HOLIDAY",
  "JOINT_LEAVE",
  "INSTITUTION_NON_WORKING",
] as const;

export type CalendarOverrideType = (typeof CALENDAR_OVERRIDE_TYPES)[number];

export type CalendarOverride = Readonly<{
  date: string;
  type: CalendarOverrideType;
}>;

export type CountWorkingDaysInput = Readonly<{
  startDate: string;
  endDate: string;
  calendarOverrides?: readonly CalendarOverride[];
}>;

function toEpochDay(value: string): number {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `Tanggal bisnis harus menggunakan format YYYY-MM-DD: ${value}.`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const milliseconds = date.getTime();

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `Tanggal bisnis tidak valid: ${value}.`,
    );
  }

  return milliseconds / MILLISECONDS_PER_DAY;
}

function validateOverrideType(
  type: string,
): asserts type is CalendarOverrideType {
  if (!(CALENDAR_OVERRIDE_TYPES as readonly string[]).includes(type)) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `Jenis pengecualian kalender tidak valid: ${type}.`,
    );
  }
}

export function countWorkingDays({
  startDate,
  endDate,
  calendarOverrides = [],
}: CountWorkingDaysInput): number {
  const startEpochDay = toEpochDay(startDate);
  const endEpochDay = toEpochDay(endDate);
  if (startEpochDay > endEpochDay) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Tanggal mulai tidak boleh setelah tanggal selesai.",
    );
  }

  const overridesByEpochDay = new Map<number, CalendarOverrideType>();
  for (const override of calendarOverrides) {
    const epochDay = toEpochDay(override.date);
    validateOverrideType(override.type);
    if (overridesByEpochDay.has(epochDay)) {
      throw new LeaveBalancePolicyError(
        "DUPLICATE_CALENDAR_DATE",
        `Tanggal kalender ${override.date} memiliki lebih dari satu pengecualian.`,
      );
    }
    overridesByEpochDay.set(epochDay, override.type);
  }

  let workingDays = 0;
  for (let epochDay = startEpochDay; epochDay <= endEpochDay; epochDay += 1) {
    const override = overridesByEpochDay.get(epochDay);
    if (override !== undefined) continue;

    const weekday = new Date(epochDay * MILLISECONDS_PER_DAY).getUTCDay();
    if (weekday >= 1 && weekday <= 5) workingDays += 1;
  }

  return workingDays;
}
