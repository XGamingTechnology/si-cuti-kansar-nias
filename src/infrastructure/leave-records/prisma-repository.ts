import { DECISION_EDITION_RENDERER } from "@/application/leave-records/ports";
import {
  Prisma,
  type PrismaClient,
  type LeaveBalanceReturn,
} from "@/generated/prisma/client";
import { WorkflowError } from "@/application/workflow/types";
import { PrismaWorkflowTransaction } from "@/infrastructure/workflow/prisma-workflow-repository";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";
import { ANNUAL_BALANCE_BUCKET_PRIORITY } from "@/domain/leave-balance";
import type { AnnualBalanceAccountState } from "@/application/leave-balance/ports";
import type { StoredDocument } from "@/application/ports/document-storage";
import type {
  DecisionSnapshot,
  DecisionEdition,
  DecisionPlacement,
  LeaveRecordsRepository,
  ReturnRecord,
  ReturnSnapshot,
  ReturnTransaction,
} from "@/application/leave-records/ports";

function returnRecord(r: LeaveBalanceReturn): ReturnRecord {
  return {
    ...r,
    basisDate: r.basisDate.toISOString().slice(0, 10),
    snapshot: r.snapshot as unknown as ReturnSnapshot,
  };
}
const available = (
  r: Omit<AnnualBalanceAccountState, "availableDays">,
): AnnualBalanceAccountState => ({
  ...r,
  availableDays: r.grantedDays - r.reservedDays - r.committedDays,
});
export class PrismaLeaveRecordsRepository implements LeaveRecordsRepository {
  constructor(private readonly db: PrismaClient) {}
  async saveEdition(record: Omit<DecisionEdition, "version">) {
    return this.db
      .$transaction(async (db) => {
        await db.$queryRaw(
          Prisma.sql`SELECT "id" FROM "LeaveDecisionArchive" WHERE "id" = ${record.archiveId}::uuid FOR UPDATE`,
        );
        const retry = await db.leaveDecisionEdition.findUnique({
          where: { idempotencyKey: record.idempotencyKey },
        });
        const map = (e: typeof retry) => ({
          ...e!,
          placement: e!.placement as unknown as DecisionPlacement,
          key: e!.storageKey,
          checksum: e!.checksumSha256,
          size: e!.sizeBytes,
        });
        if (retry) {
          if (
            retry.payloadHash !== record.payloadHash ||
            retry.archiveId !== record.archiveId ||
            retry.createdByUserId !== record.createdByUserId
          )
            throw new WorkflowError(
              "CONFLICT",
              "Kunci penyimpanan sudah dipakai untuk data berbeda.",
            );
          return map(retry);
        }
        const last = await db.leaveDecisionEdition.findFirst({
          where: { archiveId: record.archiveId },
          orderBy: { version: "desc" },
        });
        const { key, checksum, size, ...data } = record;
        const made = await db.leaveDecisionEdition.create({
          data: {
            ...data,
            placement: record.placement as unknown as Prisma.InputJsonObject,
            storageKey: key,
            checksumSha256: checksum,
            sizeBytes: size,
            version: (last?.version ?? 0) + 1,
            rendererVersion: DECISION_EDITION_RENDERER,
          },
        });
        return map(made);
      })
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new WorkflowError(
            "CONFLICT",
            "Kunci penyimpanan atau versi edisi sudah digunakan. Muat ulang arsip.",
          );
        throw error;
      });
  }
  async verifyLegacyDecision(
    requestId: string,
    documentId: string | null,
    actorUserId: string,
    actorName: string,
    now: Date,
  ) {
    await this.db.$transaction(async (db) => {
      const workflow = new PrismaWorkflowTransaction(db);
      const request = await workflow.lockLeaveRequest(requestId);
      if (!request)
        throw new WorkflowError("NOT_FOUND", "Pengajuan cuti tidak ditemukan.");
      if (request.status !== "APPROVED" && request.status !== "REJECTED")
        throw new WorkflowError(
          "ILLEGAL_TRANSITION",
          "Hanya keputusan final dapat diverifikasi sebagai arsip lama.",
        );
      const transition = await db.leaveRequestTransition.findFirst({
        where: {
          leaveRequestId: request.id,
          revisionId: request.currentRevision.id,
          toStatus: request.status,
        },
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      });
      if (!transition)
        throw new WorkflowError(
          "CONFLICT",
          "Rekaman keputusan final tidak ditemukan. Tidak dapat membuat metadata persetujuan baru.",
        );
      const existing = await db.leaveDecisionArchive.findUnique({
        where: { transitionId: transition.id },
      });
      if (existing) {
        if (existing.sourceDocumentId !== documentId)
          throw new WorkflowError(
            "CONFLICT",
            "Arsip final sudah terkunci pada sumber berbeda.",
          );
        return;
      }
      const source =
        request.status === "REJECTED" && !documentId
          ? null
          : await workflow.resolveDecisionSource(
              request,
              request.status,
              documentId ?? undefined,
            );
      if (request.status === "APPROVED" && !documentId)
        throw new WorkflowError(
          "VALIDATION",
          "Pilih scan asli yang digunakan pada keputusan lama.",
        );
      const document = source
        ? await db.leaveDocument.findUnique({ where: { id: source.id } })
        : null;
      if (
        document &&
        (document.uploadedAt ?? document.generatedAt) > transition.occurredAt
      )
        throw new WorkflowError(
          "CONFLICT",
          "Scan ini diunggah setelah keputusan lama dan tidak dapat dijadikan bukti keputusan tersebut.",
        );
      const sourceSnapshot = document?.snapshot as
        | Record<string, unknown>
        | undefined;
      await db.leaveDecisionArchive.create({
        data: {
          leaveRequestId: request.id,
          revisionId: request.currentRevision.id,
          transitionId: transition.id,
          sourceDocumentId: source?.id ?? null,
          snapshot: {
            status: request.status,
            requestId,
            revisionId: request.currentRevision.id,
            revisionNumber: request.currentRevision.revisionNumber,
            employeeId: request.employeeId,
            employeeName: "Sesuai dokumen sumber / ID pegawai",
            employeeNip:
              typeof sourceSnapshot?.employeeNip === "string"
                ? sourceSnapshot.employeeNip
                : "Tidak tersimpan pada snapshot historis",
            startDate: request.currentRevision.startDate,
            endDate: request.currentRevision.endDate,
            leaveType: request.currentRevision.leaveType,
            actorUserId: transition.actorUserId,
            actorName: "Lihat ID Admin pencatat keputusan",
            occurredAt: transition.occurredAt.toISOString(),
            reason: transition.reason,
            evidenceReference: transition.evidenceReference,
            sourceDocumentVersion: source?.version ?? null,
            sourceChecksumSha256: source?.checksumSha256 ?? null,
            sourceReview: {
              actorUserId,
              actorName,
              reviewedAt: now.toISOString(),
            },
          },
        },
      });
    });
  }
  async decision(requestId: string) {
    const d = await this.db.leaveDecisionArchive.findFirst({
      where: { leaveRequestId: requestId },
      include: {
        artifact: true,
        sourceDocument: true,
        editions: { orderBy: { version: "desc" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    if (!d) return null;
    return {
      id: d.id,
      leaveRequestId: d.leaveRequestId,
      revisionId: d.revisionId,
      transitionId: d.transitionId,
      sourceDocumentId: d.sourceDocumentId,
      sourceStorageKey: d.sourceDocument?.storageKey ?? null,
      editions: d.editions.map((e) => ({
        ...e,
        placement: e.placement as unknown as DecisionPlacement,
        key: e.storageKey,
        checksum: e.checksumSha256,
        size: e.sizeBytes,
      })),
      snapshot: d.snapshot as unknown as DecisionSnapshot,
      artifact: d.artifact
        ? {
            id: d.artifact.id,
            key: d.artifact.storageKey,
            size: d.artifact.sizeBytes,
            checksum: d.artifact.checksumSha256,
          }
        : null,
    };
  }
  async createArtifact(archiveId: string, stored: StoredDocument) {
    const data = {
      archiveId,
      storageKey: stored.key,
      checksumSha256: stored.checksum,
      sizeBytes: stored.size,
    };
    let result;
    try {
      result = await this.db.leaveDecisionArtifact.create({ data });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
      result = await this.db.leaveDecisionArtifact.findUnique({
        where: { archiveId },
      });
      if (!result) throw error;
    }
    return {
      id: result.id,
      key: result.storageKey,
      checksum: result.checksumSha256,
      size: result.sizeBytes,
    };
  }
  async returns(requestId: string) {
    return (
      await this.db.leaveBalanceReturn.findMany({
        where: { leaveRequestId: requestId },
        orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      })
    ).map(returnRecord);
  }
  withReturnTransaction<T>(
    requestId: string,
    work: (tx: ReturnTransaction) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (db) => {
        const workflow = new PrismaWorkflowTransaction(db);
        const request = await workflow.lockLeaveRequest(requestId);
        if (!request)
          throw new WorkflowError(
            "NOT_FOUND",
            "Pengajuan cuti tidak ditemukan.",
          );
        // Rollover already locks Employee. Sharing this lock prevents a stale rollover snapshot.
        await db.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" = ${request.employeeId}::uuid FOR UPDATE`,
        );
        const year = Number(request.currentRevision.startDate.slice(0, 4));
        const balance = PrismaAnnualBalanceRepository.inTransaction(db);
        return balance.withLockedAccounts(
          request.employeeId,
          year,
          ANNUAL_BALANCE_BUCKET_PRIORITY,
          async (locked) => {
            const commits = await db.annualBalanceOperation.findMany({
              where: {
                referenceType: "LEAVE_REQUEST_REVISION",
                referenceId: request.currentRevision.id,
                operationType: "COMMIT",
              },
            });
            const reversals = await db.annualBalanceOperation.findMany({
              where: {
                operationType: "REVERSAL",
                compensatesOperationId: { in: commits.map((c) => c.id) },
              },
            });
            const hasDownstreamRollover =
              (await db.annualRolloverCommit.count({
                where: {
                  employeeId: request.employeeId,
                  targetYear: { gt: year },
                },
              })) > 0;
            const tx: ReturnTransaction = {
              state: {
                request,
                accounts: locked.accounts,
                commits,
                reversals,
                hasDownstreamRollover,
              },
              annualBalanceRepository: balance,
              findRetry: async (key) => {
                const r = await db.leaveBalanceReturn.findUnique({
                  where: { idempotencyKey: key },
                });
                return r ? returnRecord(r) : null;
              },
              evidence: async (id) => {
                const e = await db.leaveDocument.findUnique({ where: { id } });
                return e
                  ? {
                      revisionId: e.revisionId,
                      leaveRequestId: e.leaveRequestId,
                      checksum: e.checksumSha256,
                      storageKey: e.storageKey,
                      documentType: e.documentType,
                    }
                  : null;
              },
              freshAccounts: async () =>
                (
                  await db.annualBalanceAccount.findMany({
                    where: {
                      employeeId: request.employeeId,
                      entitlementYear: year,
                    },
                    orderBy: { bucket: "asc" },
                  })
                ).map(available),
              create: async (record, operations) => {
                const made = await db.leaveBalanceReturn.create({
                  data: {
                    ...record,
                    basisDate: new Date(record.basisDate + "T00:00:00Z"),
                    snapshot:
                      record.snapshot as unknown as Prisma.InputJsonObject,
                    operations: {
                      create: operations.map((o) => ({ operationId: o.id })),
                    },
                  },
                });
                return returnRecord(made);
              },
            };
            return work(tx);
          },
        );
      },
      { timeout: 20_000 },
    );
  }
}
