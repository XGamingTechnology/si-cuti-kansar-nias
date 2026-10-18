import { z } from "zod";
import type { Principal } from "@/modules/auth/service";
import { requireRole, requireAdmin } from "@/application/authorization/policy";
import { toBusinessDate } from "@/domain/business-date";
import { LEAVE_TYPES } from "@/application/workflow/types";
export class DashboardError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}
export const statuses = [
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      v >= "1900-01-01" &&
      v <= "9999-12-31" &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const filterSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    kind: z.enum(["leave", "permission"]),
    type: z.string().max(100).optional(),
    status: z.enum([...statuses, "all"]).default("APPROVED"),
    employeeId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.string().max(1500).optional(),
  })
  .strict();
export type DashboardFilter = z.infer<typeof filterSchema>;
export type AgendaCursor = { date: string; id: string; filter: string };
export function requireDashboardUser(actor: Principal) {
  if (actor.role !== "ADMIN_KEPEGAWAIAN" && actor.role !== "PEGAWAI")
    throw new DashboardError(403, "Akses ditolak.");
}
export function parseDashboardFilter(
  actor: Principal,
  params: URLSearchParams,
  now: Date,
  maxDays: number,
): DashboardFilter {
  requireDashboardUser(actor);
  if (actor.role === "PEGAWAI" && params.has("employeeId"))
    throw new DashboardError(403, "Filter pegawai tidak diizinkan.");
  if (new Set(params.keys()).size !== [...params.keys()].length)
    throw new DashboardError(422, "Filter berulang tidak valid.");
  const today = toBusinessDate(now);
  const month = today.slice(0, 7);
  const last = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const input = Object.fromEntries(params);
  const result = filterSchema.safeParse({
    from: `${month}-01`,
    to: last,
    ...input,
  });
  if (!result.success)
    throw new DashboardError(
      422,
      "Filter tanggal, jenis, status atau halaman tidak valid.",
    );
  const f = result.data;
  if (
    f.from > f.to ||
    (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1 > maxDays
  )
    throw new DashboardError(
      422,
      `Rentang harus berurutan dan maksimal ${maxDays} hari.`,
    );
  if (
    f.type &&
    !(f.kind === "leave"
      ? LEAVE_TYPES.includes(f.type as (typeof LEAVE_TYPES)[number])
      : z.uuid().safeParse(f.type).success)
  )
    throw new DashboardError(422, "Jenis tidak sesuai kategori pengajuan.");
  return f;
}
export function filterIdentity(f: DashboardFilter, actor: Principal) {
  return JSON.stringify([
    actor.role,
    actor.employeeId,
    f.from,
    f.to,
    f.kind,
    f.type ?? null,
    f.status,
    f.employeeId ?? null,
  ]);
}
export function readCursor(
  f: DashboardFilter,
  actor: Principal,
): AgendaCursor | null {
  if (!f.cursor) return null;
  try {
    const value = z
      .object({ date: dateSchema, id: z.uuid(), filter: z.string() })
      .strict()
      .parse(JSON.parse(Buffer.from(f.cursor, "base64url").toString("utf8")));
    if (value.filter !== filterIdentity(f, actor)) throw new Error();
    return value;
  } catch {
    throw new DashboardError(422, "Halaman tidak valid. Muat ulang daftar.");
  }
}
export type PeriodCount = {
  typeId: string;
  typeLabel: string;
  status: string;
  count: number;
};
export type AgendaItem = {
  requestId: string;
  kind: "leave" | "permission";
  status: string;
  typeId: string;
  typeLabel: string;
  startDate: string;
  endDate: string;
  hasBalanceReturn: boolean;
  employee?: { id: string; fullName: string };
};
// Bounded chips per date; the complete date agenda remains server-paginated.
export const CALENDAR_CHIP_LIMIT = 3;
export type CalendarChip = {
  requestId: string;
  typeLabel: string;
  status: string;
  hasBalanceReturn: boolean;
  employee?: { fullName: string };
};
export type CalendarDay = {
  date: string;
  requestCount: number;
  entries: CalendarChip[];
};
export type Summary = {
  fixed:
    | {
        pendingLeave: number;
        pendingPermission: number;
        approvedTodayEmployees: number;
      }
    | {
        ownLeave: Record<string, number>;
        ownPermission: Record<string, number>;
      };
  groups: PeriodCount[];
  types: { id: string; name: string }[];
};
export interface DashboardReader {
  summary(
    actor: Principal,
    filter: DashboardFilter,
    today: string,
  ): Promise<Summary>;
  calendar(
    actor: Principal,
    filter: DashboardFilter,
  ): Promise<{
    days: CalendarDay[];
    uniqueRequestCount: number;
  }>;
  agenda(
    actor: Principal,
    filter: DashboardFilter,
    cursor: AgendaCursor | null,
  ): Promise<{ items: AgendaItem[]; total: number }>;
  employees(
    query: string,
    limit: number,
    cursor?: string,
  ): Promise<{ id: string; fullName: string; nip: string }[]>;
  balance(employeeId: string, year: number): Promise<unknown>;
}
export class DashboardService {
  constructor(
    private readonly reader: DashboardReader,
    private readonly clock = () => new Date(),
  ) {}
  async read(
    actor: Principal,
    resource: "summary" | "calendar" | "agenda",
    params: URLSearchParams,
  ) {
    const now = this.clock();
    const filter = parseDashboardFilter(
      actor,
      params,
      now,
      resource === "calendar" ? 62 : 366,
    );
    const envelope = {
      definitionVersion: "m6-v1",
      asOf: now.toISOString(),
      businessDate: toBusinessDate(now),
      timeZone: "Asia/Jakarta",
      filters: { ...filter, cursor: undefined },
      scope: actor.role === "PEGAWAI" ? "SELF" : "ADMIN",
    };
    if (resource === "summary")
      return {
        ...envelope,
        ...(await this.reader.summary(actor, filter, envelope.businessDate)),
      };
    if (resource === "calendar")
      return { ...envelope, ...(await this.reader.calendar(actor, filter)) };
    const result = await this.reader.agenda(
      actor,
      filter,
      readCursor(filter, actor),
    );
    const more = result.items.length > filter.limit;
    const items = result.items.slice(0, filter.limit);
    const last = items.at(-1);
    return {
      ...envelope,
      items,
      total: result.total,
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({
                date: last.startDate,
                id: last.requestId,
                filter: filterIdentity(filter, actor),
              }),
            ).toString("base64url")
          : null,
    };
  }
  balance(actor: Principal) {
    requireRole(actor, "PEGAWAI");
    return this.reader.balance(
      actor.employeeId,
      Number(toBusinessDate(this.clock()).slice(0, 4)),
    );
  }
  async employees(actor: Principal, params: URLSearchParams) {
    requireAdmin(actor);
    const parsed = z
      .object({
        q: z.string().trim().max(100).default(""),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.uuid().optional(),
      })
      .strict()
      .safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new DashboardError(422, "Pencarian pegawai tidak valid.");
    const { q, limit, cursor } = parsed.data;
    const rows = await this.reader.employees(q, limit + 1, cursor);
    return {
      employees: rows.slice(0, limit),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }
}
