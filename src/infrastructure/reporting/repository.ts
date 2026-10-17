import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  ReportError,
  type Audit,
  type ReportRepository,
  type ReportSession,
  type Run,
  type Artifact,
} from "@/application/reporting/contracts";
const json = (v: object) => v as Prisma.InputJsonObject;
function session(db: Prisma.TransactionClient): ReportSession {
  return {
    activeAdmin: async (id) =>
      Boolean(
        await db.user.findFirst({
          where: {
            id,
            isActive: true,
            role: "ADMIN_KEPEGAWAIAN",
            employee: { isActive: true },
          },
        }),
      ),
    retry: (actorUserId, idempotencyKey) =>
      db.reportRun.findUnique({
        where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } },
      }) as Promise<Run | null>,
    run: (id) =>
      db.reportRun.findUnique({ where: { id } }) as Promise<Run | null>,
    insertRun: async (r) => {
      await db.reportRun.create({ data: { ...r, filters: json(r.filters) } });
    },
    artifact: (id) =>
      db.reportArtifact.findUnique({
        where: { id },
      }) as Promise<Artifact | null>,
    format: (runId, format) =>
      db.reportArtifact.findUnique({
        where: { runId_format: { runId, format } },
      }) as Promise<Artifact | null>,
    exportRetry: (actorUserId, idempotencyKey) =>
      db.reportExportRequest.findUnique({
        where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } },
        select: { runId: true, format: true, artifactId: true },
      }),
    exportRequest: async (
      actorUserId,
      idempotencyKey,
      runId,
      format,
      artifactId,
    ) => {
      await db.reportExportRequest.create({
        data: {
          id: randomUUID(),
          actorUserId,
          idempotencyKey,
          runId,
          format,
          artifactId,
        },
      });
    },
    insertArtifact: async (a) => {
      await db.reportArtifact.create({ data: a });
    },
    audit: async (e) => {
      try {
        await db.reportAuditEvent.create({
          data: { id: randomUUID(), ...e, filters: json(e.filters) },
        });
      } catch {
        throw new ReportError(
          503,
          "AUDIT_UNAVAILABLE",
          "Audit laporan tidak tersedia. Hasil tidak dilayani.",
        );
      }
    },
  };
}
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly db: PrismaClient) {}
  withActor<T>(actor: string, work: (s: ReportSession) => Promise<T>) {
    // Coordination transaction only; the reader owns a separate short read-only snapshot.
    // No workflow/employee locks are held while filesystem IO or rendering runs.
    return this.db.$transaction(
      async (tx) => {
        const [v] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${actor}, 707)) AS locked`;
        if (!v.locked)
          throw new ReportError(
            429,
            "REPORT_BUSY",
            "Pembuatan/pembacaan laporan lain masih berjalan. Coba lagi.",
          );
        return work(session(tx));
      },
      { timeout: 60000, maxWait: 5000 },
    );
  }
  audit(e: Audit) {
    return this.db.$transaction((tx) => session(tx).audit(e));
  }
}
