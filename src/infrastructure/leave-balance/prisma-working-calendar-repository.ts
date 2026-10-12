import type { PrismaClient } from "@/generated/prisma/client";
import type {
  CalendarOverride,
  CalendarOverrideType,
} from "@/domain/leave-balance";

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDatabaseDate(date: string): Date {
  if (!BUSINESS_DATE_PATTERN.test(date)) {
    throw new Error("Tanggal kalender harus menggunakan format YYYY-MM-DD.");
  }
  const value = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Tanggal kalender tidak valid.");
  }
  return value;
}

function toBusinessDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type CalendarExceptionRecord = CalendarOverride &
  Readonly<{
    id: string;
    name: string;
    sourceReference: string | null;
    notes: string | null;
  }>;

export type CalendarExceptionWrite = Readonly<{
  date: string;
  type: CalendarOverrideType;
  name: string;
  sourceReference?: string | null;
  notes?: string | null;
}>;

export class PrismaWorkingCalendarRepository {
  constructor(private readonly database: PrismaClient) {}

  async listForDateRange(
    startDate: string,
    endDate: string,
  ): Promise<CalendarExceptionRecord[]> {
    const records = await this.database.workingCalendarException.findMany({
      where: {
        date: { gte: toDatabaseDate(startDate), lte: toDatabaseDate(endDate) },
      },
      orderBy: { date: "asc" },
    });
    return records.map((record) => ({
      id: record.id,
      date: toBusinessDate(record.date),
      type: record.type,
      name: record.name,
      sourceReference: record.sourceReference,
      notes: record.notes,
    }));
  }

  async create(
    input: CalendarExceptionWrite,
  ): Promise<CalendarExceptionRecord> {
    const record = await this.database.workingCalendarException.create({
      data: { ...input, date: toDatabaseDate(input.date) },
    });
    return { ...record, date: toBusinessDate(record.date) };
  }

  async update(
    id: string,
    input: CalendarExceptionWrite,
  ): Promise<CalendarExceptionRecord> {
    const record = await this.database.workingCalendarException.update({
      where: { id },
      data: { ...input, date: toDatabaseDate(input.date) },
    });
    return { ...record, date: toBusinessDate(record.date) };
  }
}
