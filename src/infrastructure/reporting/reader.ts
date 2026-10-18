import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  ReportError,
  type Filters,
  type ReportReader,
  type ReportRow,
  MAX_ROWS,
} from "@/application/reporting/contracts";
const leaves: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Cuti Sakit",
  IMPORTANT_REASON: "Cuti Alasan Penting",
  LARGE: "Cuti Besar",
  MATERNITY: "Cuti Melahirkan",
  CLTN: "CLTN",
};
export class PrismaReportReader implements ReportReader {
  constructor(
    private readonly db: PrismaClient,
    private readonly timeoutMs = 10000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
      throw new Error("Batas statement timeout tidak valid.");
  }
  async read(f: Filters) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          await tx.$queryRaw`SELECT set_config('statement_timeout',${String(this.timeoutMs)},true)`;
          const [time] = await tx.$queryRaw<
            { capturedAt: Date }[]
          >`SELECT transaction_timestamp() AS "capturedAt"`;
          const leave = f.reportCode === "LEAVE_REQUESTS";
          const source = leave
            ? Prisma.sql`"LeaveRequest" q JOIN "LeaveRequestRevision" r ON r."leaveRequestId"=q.id AND r."revisionNumber"=q."currentRevisionNumber"`
            : Prisma.sql`"PermissionRequest" q JOIN "PermissionRequestRevision" r ON r."permissionRequestId"=q.id AND r."revisionNumber"=q."currentRevisionNumber" JOIN "PermissionType" p ON p.id=r."permissionTypeId"`;
          const filterLabels: { employee?: string; type?: string } = {};
          if (f.employeeId) {
            const e = await tx.employee.findUnique({
              where: { id: f.employeeId },
              select: { fullName: true, nip: true },
            });
            if (!e)
              throw new ReportError(
                422,
                "INVALID_EMPLOYEE",
                "Pegawai filter tidak ditemukan.",
              );
            filterLabels.employee = `${e.fullName} / ${e.nip}`;
          }
          if (f.type) {
            if (leave) filterLabels.type = leaves[f.type];
            else {
              const t = await tx.permissionType.findUnique({
                where: { id: f.type },
                select: { name: true, code: true },
              });
              if (!t)
                throw new ReportError(
                  422,
                  "INVALID_TYPE",
                  "Jenis izin filter tidak ditemukan.",
                );
              filterLabels.type = `${t.name} (${t.code})`;
            }
          }
          const pattern = `%${f.search.replace(/[\\%_]/g, (v) => `\\${v}`)}%`;
          const rows = await tx.$queryRaw<
            (Omit<ReportRow, "submittedAt"> & { submittedAt: Date | null })[]
          >(Prisma.sql`
          SELECT q.id AS "requestId",r.id AS "revisionId",r."revisionNumber",e.id AS "employeeId",e.nip,e."fullName" AS name,e."workUnit",e."isActive" AS active,
          ${leave ? Prisma.sql`r."leaveType"::text` : Prisma.sql`p.code`} AS "typeCode",${leave ? Prisma.sql`r."leaveType"::text` : Prisma.sql`p.name`} AS "typeLabel",
          to_char(r."startDate",'YYYY-MM-DD') AS "startDate",to_char(r."endDate",'YYYY-MM-DD') AS "endDate",q.status::text AS status,r."submittedAt",
          ${leave ? Prisma.sql`CASE WHEN r."leaveType"='ANNUAL' THEN r."calculatedWorkingDays" ELSE NULL END` : Prisma.sql`NULL::integer`} AS "workingDays",
          ${leave ? Prisma.sql`EXISTS(SELECT 1 FROM "LeaveBalanceReturn" b WHERE b."leaveRequestId"=q.id AND b."revisionId"=r.id)` : Prisma.sql`FALSE`} AS "hasBalanceReturn"
          FROM ${source} JOIN "Employee" e ON e.id=q."employeeId"
          WHERE r."startDate"<=${f.to}::date AND r."endDate">=${f.from}::date
          AND ${f.status === "ALL_NON_DRAFT" ? Prisma.sql`q.status<>'DRAFT'` : Prisma.sql`q.status::text=${f.status}`}
          ${f.type ? Prisma.sql`AND ${leave ? Prisma.sql`r."leaveType"::text` : Prisma.sql`r."permissionTypeId"::text`}=${f.type}` : Prisma.empty}
          ${f.employeeId ? Prisma.sql`AND e.id=${f.employeeId}::uuid` : Prisma.empty}
          ${f.workUnit ? Prisma.sql`AND e."workUnit"=${f.workUnit}` : Prisma.empty}
          ${f.search ? Prisma.sql`AND (e."fullName" ILIKE ${pattern} ESCAPE chr(92) OR e.nip ILIKE ${pattern} ESCAPE chr(92))` : Prisma.empty}
          ${f.activeState === "all" ? Prisma.empty : Prisma.sql`AND e."isActive"=${f.activeState === "active"}`}
          ORDER BY r."startDate",q.id LIMIT ${MAX_ROWS + 1}`);
          return {
            capturedAt: time.capturedAt,
            filterLabels,
            rows: rows.map((r) => ({
              ...r,
              typeLabel: leave
                ? (leaves[r.typeCode] ?? r.typeCode)
                : r.typeLabel,
              submittedAt: r.submittedAt
                ? new Date(r.submittedAt).toISOString()
                : null,
            })),
          };
        },
        { isolationLevel: "RepeatableRead", timeout: 15000 },
      );
    } catch (e) {
      if (e instanceof ReportError) throw e;
      throw new ReportError(
        503,
        "QUERY_UNAVAILABLE",
        "Query laporan gagal atau melewati batas waktu. Persempit filter lalu coba lagi.",
      );
    }
  }
}
