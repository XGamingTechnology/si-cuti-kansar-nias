import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Principal } from "@/modules/auth/service";
import { annualBalanceReadiness } from "@/application/leave-balance/administration";
import { PrismaAnnualBalanceAdministrationRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-administration-repository";
import { CALENDAR_CHIP_LIMIT } from "@/application/dashboard/contracts";
import type {
  CalendarChip,
  DashboardFilter,
  AgendaCursor,
  DashboardReader,
  PeriodCount,
  Summary,
  AgendaItem,
} from "@/application/dashboard/contracts";
const labels: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Cuti Sakit",
  IMPORTANT_REASON: "Cuti Alasan Penting",
  LARGE: "Cuti Besar",
  MATERNITY: "Cuti Melahirkan",
  CLTN: "CLTN",
};
function source(kind: DashboardFilter["kind"]) {
  return kind === "leave"
    ? Prisma.sql`"LeaveRequest" q JOIN "LeaveRequestRevision" r ON r."leaveRequestId"=q.id AND r."revisionNumber"=q."currentRevisionNumber"`
    : Prisma.sql`"PermissionRequest" q JOIN "PermissionRequestRevision" r ON r."permissionRequestId"=q.id AND r."revisionNumber"=q."currentRevisionNumber" JOIN "PermissionType" p ON p.id=r."permissionTypeId"`;
}
function owner(actor: Principal) {
  return actor.role === "PEGAWAI"
    ? Prisma.sql`q."employeeId"=${actor.employeeId}::uuid`
    : Prisma.sql`TRUE`;
}
function where(actor: Principal, f: DashboardFilter) {
  const type =
    f.kind === "leave"
      ? Prisma.sql`r."leaveType"::text`
      : Prisma.sql`r."permissionTypeId"::text`;
  return Prisma.sql`${owner(actor)} AND r."startDate"<=${f.to}::date AND r."endDate">=${f.from}::date AND ${f.status === "all" ? Prisma.sql`q.status::text <> 'DRAFT'` : Prisma.sql`q.status::text=${f.status}`} ${f.type ? Prisma.sql`AND ${type}=${f.type}` : Prisma.empty} ${f.employeeId ? Prisma.sql`AND q."employeeId"=${f.employeeId}::uuid` : Prisma.empty}`;
}
const typeId = (kind: DashboardFilter["kind"]) =>
  kind === "leave"
    ? Prisma.sql`r."leaveType"::text`
    : Prisma.sql`r."permissionTypeId"::text`;
export class PrismaDashboardReader implements DashboardReader {
  constructor(private readonly db: PrismaClient) {}
  async summary(
    actor: Principal,
    f: DashboardFilter,
    today: string,
  ): Promise<Summary> {
    return this.db.$transaction(
      async (tx) => {
        const groups = await tx.$queryRaw<
          (PeriodCount & { typeLabel: string })[]
        >(
          Prisma.sql`SELECT ${typeId(f.kind)} AS "typeId", ${f.kind === "leave" ? Prisma.sql`r."leaveType"::text` : Prisma.sql`p.name`} AS "typeLabel", q.status::text AS status, COUNT(*)::int AS count FROM ${source(f.kind)} WHERE ${where(actor, f)} GROUP BY 1,2,3 ORDER BY 1,3`,
        );
        const countStatus = async (kind: "leave" | "permission") =>
          tx.$queryRaw<{ status: string; count: number }[]>(
            Prisma.sql`SELECT q.status::text AS status,COUNT(*)::int AS count FROM ${source(kind)} WHERE ${owner(actor)} GROUP BY q.status`,
          );
        const [leave, permission] = await Promise.all([
          countStatus("leave"),
          countStatus("permission"),
        ]);
        let fixed: Summary["fixed"];
        if (actor.role === "ADMIN_KEPEGAWAIAN") {
          const [row] = await tx.$queryRaw<{ count: number }[]>(
            Prisma.sql`SELECT COUNT(DISTINCT q."employeeId")::int AS count FROM ${source("leave")} WHERE q.status='APPROVED' AND r."startDate"<=${today}::date AND r."endDate">=${today}::date`,
          );
          fixed = {
            pendingLeave:
              leave.find((v) => v.status === "SUBMITTED")?.count ?? 0,
            pendingPermission:
              permission.find((v) => v.status === "SUBMITTED")?.count ?? 0,
            approvedTodayEmployees: row.count,
          };
        } else
          fixed = {
            ownLeave: Object.fromEntries(leave.map((v) => [v.status, v.count])),
            ownPermission: Object.fromEntries(
              permission.map((v) => [v.status, v.count]),
            ),
          };
        const types =
          f.kind === "leave"
            ? Object.entries(labels).map(([id, name]) => ({ id, name }))
            : await tx.$queryRaw<{ id: string; name: string }[]>(
                Prisma.sql`SELECT t.id,t.name FROM "PermissionType" t WHERE t."isActive"=TRUE OR EXISTS (SELECT 1 FROM ${source("permission")} WHERE r."permissionTypeId"=t.id AND ${owner(actor)}) ORDER BY t.name,t.id`,
              );
        return {
          fixed,
          groups: groups.map((v) => ({
            ...v,
            typeLabel:
              f.kind === "leave" ? (labels[v.typeId] ?? v.typeId) : v.typeLabel,
          })),
          types,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async calendar(actor: Principal, f: DashboardFilter) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
        const days = await tx.$queryRaw<
          { date: string; requestCount: number }[]
        >(
          Prisma.sql`WITH eligible AS (SELECT q.id,r."startDate",r."endDate" FROM ${source(f.kind)} WHERE ${where(actor, f)}) SELECT to_char(d,'YYYY-MM-DD') AS date,COUNT(e.id)::int AS "requestCount" FROM generate_series(${f.from}::date,${f.to}::date,interval '1 day') d LEFT JOIN eligible e ON e."startDate"<=d AND e."endDate">=d GROUP BY d ORDER BY d`,
        );
        // At most 62 * 3 rows, no private detail columns. Scope and current pointer are
        // applied before per-day limiting so another employee cannot crowd out SELF.
        const chips = await tx.$queryRaw<
          (CalendarChip & { date: string; fullName: string | null })[]
        >(
          Prisma.sql`WITH eligible AS (
            SELECT q.id AS "requestId",q.status::text AS status,r."startDate",r."endDate",
            ${f.kind === "leave" ? Prisma.sql`r."leaveType"::text` : Prisma.sql`p.name`} AS "typeLabel",
            ${actor.role === "ADMIN_KEPEGAWAIAN" ? Prisma.sql`e."fullName"` : Prisma.sql`NULL::text`} AS "fullName",
            ${f.kind === "leave" ? Prisma.sql`EXISTS(SELECT 1 FROM "LeaveBalanceReturn" b WHERE b."leaveRequestId"=q.id AND b."revisionId"=r.id)` : Prisma.sql`FALSE`} AS "hasBalanceReturn"
            FROM ${source(f.kind)} ${actor.role === "ADMIN_KEPEGAWAIAN" ? Prisma.sql`JOIN "Employee" e ON e.id=q."employeeId"` : Prisma.empty}
            WHERE ${where(actor, f)}
          ) SELECT to_char(d,'YYYY-MM-DD') AS date,c."requestId",c.status,c."typeLabel",c."fullName",c."hasBalanceReturn"
          FROM generate_series(${f.from}::date,${f.to}::date,interval '1 day') d
          JOIN LATERAL (SELECT * FROM eligible e WHERE e."startDate"<=d AND e."endDate">=d
            ORDER BY e."startDate",e."requestId" LIMIT ${CALENDAR_CHIP_LIMIT}) c ON TRUE ORDER BY d,c."startDate",c."requestId"`,
        );
        const entries = new Map<string, CalendarChip[]>();
        for (const c of chips) {
          const values = entries.get(c.date) ?? [];
          values.push({
            requestId: c.requestId,
            typeLabel:
              f.kind === "leave"
                ? (labels[c.typeLabel] ?? c.typeLabel)
                : c.typeLabel,
            status: c.status,
            hasBalanceReturn: c.hasBalanceReturn,
            ...(actor.role === "ADMIN_KEPEGAWAIAN"
              ? { employee: { fullName: c.fullName! } }
              : {}),
          });
          entries.set(c.date, values);
        }
        const [row] = await tx.$queryRaw<{ count: number }[]>(
          Prisma.sql`SELECT COUNT(*)::int AS count FROM ${source(f.kind)} WHERE ${where(actor, f)}`,
        );
        return {
          days: days.map((d) => ({ ...d, entries: entries.get(d.date) ?? [] })),
          uniqueRequestCount: row.count,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async agenda(
    actor: Principal,
    f: DashboardFilter,
    cursor: AgendaCursor | null,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            requestId: string;
            status: string;
            typeId: string;
            typeLabel: string;
            startDate: string;
            endDate: string;
            hasBalanceReturn: boolean;
            employeeId: string;
            fullName: string;
          }[]
        >(
          Prisma.sql`SELECT q.id AS "requestId",q.status::text AS status,${typeId(f.kind)} AS "typeId",${f.kind === "leave" ? Prisma.sql`r."leaveType"::text` : Prisma.sql`p.name`} AS "typeLabel",to_char(r."startDate",'YYYY-MM-DD') AS "startDate",to_char(r."endDate",'YYYY-MM-DD') AS "endDate",${f.kind === "leave" ? Prisma.sql`EXISTS(SELECT 1 FROM "LeaveBalanceReturn" b WHERE b."leaveRequestId"=q.id AND b."revisionId"=r.id)` : Prisma.sql`FALSE`} AS "hasBalanceReturn",q."employeeId",e."fullName" FROM ${source(f.kind)} JOIN "Employee" e ON e.id=q."employeeId" WHERE ${where(actor, f)} ${cursor ? Prisma.sql`AND (r."startDate",q.id)>(${cursor.date}::date,${cursor.id}::uuid)` : Prisma.empty} ORDER BY r."startDate",q.id LIMIT ${f.limit + 1}`,
        );
        const [count] = await tx.$queryRaw<{ count: number }[]>(
          Prisma.sql`SELECT COUNT(*)::int AS count FROM ${source(f.kind)} WHERE ${where(actor, f)}`,
        );
        return {
          total: count.count,
          items: rows.map(
            (v): AgendaItem => ({
              requestId: v.requestId,
              kind: f.kind,
              status: v.status,
              typeId: v.typeId,
              typeLabel:
                f.kind === "leave"
                  ? (labels[v.typeId] ?? v.typeId)
                  : v.typeLabel,
              startDate: v.startDate,
              endDate: v.endDate,
              hasBalanceReturn: v.hasBalanceReturn,
              ...(actor.role === "ADMIN_KEPEGAWAIAN"
                ? { employee: { id: v.employeeId, fullName: v.fullName } }
                : {}),
            }),
          ),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async balance(employeeId: string, year: number) {
    const accounts = await new PrismaAnnualBalanceAdministrationRepository(
      this.db,
    ).findAccounts(employeeId, year);
    const readiness = annualBalanceReadiness(accounts);
    return {
      year,
      readiness,
      totalAvailableDays:
        readiness === "INITIALIZED"
          ? accounts.reduce((sum, account) => sum + account.availableDays, 0)
          : null,
      buckets:
        readiness === "INITIALIZED"
          ? accounts.map((v) => ({
              bucket: v.bucket,
              availableDays: v.availableDays,
            }))
          : [],
      asOf: new Date().toISOString(),
    };
  }
  employees(q: string, limit: number, cursor?: string) {
    return this.db.employee.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" as const } },
                { nip: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, fullName: true, nip: true },
      orderBy: { id: "asc" },
      take: limit,
    });
  }
}
