import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { LeaveAuthorizedOfficialError } from "@/application/leave-authorized-official/service";
import {
  prepareOfficialCorrection,
  type OfficialCorrection,
  type OfficialCorrectionInput,
  type OfficialCorrectionRepository,
  type OfficialIdentity,
} from "@/application/leave-authorized-official/correction";

function view(row: {
  id: string;
  assignmentId: string;
  actorUserId: string;
  correctedAt: Date;
  reason: string;
  sourceReference: string;
  fields: string[];
  before: unknown;
  after: unknown;
  revision: number;
}): OfficialCorrection {
  return {
    ...row,
    correctedAt: row.correctedAt.toISOString(),
    before: row.before as OfficialIdentity,
    after: row.after as OfficialIdentity,
  };
}
function conflict(): never {
  throw new LeaveAuthorizedOfficialError(
    "CONFLICT",
    "Data sudah berubah atau kunci retry berbeda. Muat ulang penugasan dan periksa kembali koreksi.",
  );
}
export class PrismaOfficialCorrectionRepository implements OfficialCorrectionRepository {
  constructor(private readonly database: PrismaClient) {}
  async history(id: string) {
    const assignment =
      await this.database.leaveAuthorizedOfficialAssignment.findUnique({
        where: { id },
      });
    if (!assignment)
      throw new LeaveAuthorizedOfficialError(
        "NOT_FOUND",
        "Penugasan pejabat cuti tidak ditemukan.",
      );
    const corrections =
      await this.database.leaveAuthorizedOfficialCorrection.findMany({
        where: { assignmentId: id },
        orderBy: { revision: "desc" },
      });
    return {
      assignment: {
        ...assignment,
        effectiveFrom: assignment.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: assignment.effectiveTo?.toISOString().slice(0, 10) ?? null,
      },
      corrections: corrections.map(view),
    };
  }
  async correct(
    id: string,
    actorUserId: string,
    input: OfficialCorrectionInput,
    now: Date,
  ) {
    const payloadHash = createHash("sha256")
      .update(JSON.stringify({ id, actorUserId, ...input }))
      .digest("hex");
    try {
      return await this.database.$transaction(async (tx) => {
        // Serialize identical retry keys before looking up a previous result, also across assignments.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 91))`;
        const prior = await tx.leaveAuthorizedOfficialCorrection.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (prior) {
          if (prior.payloadHash !== payloadHash) conflict();
          return view(prior);
        }
        await tx.$queryRaw`SELECT id FROM "LeaveAuthorizedOfficialAssignment" WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.leaveAuthorizedOfficialAssignment.findUnique({
          where: { id },
        });
        if (!row)
          throw new LeaveAuthorizedOfficialError(
            "NOT_FOUND",
            "Penugasan pejabat cuti tidak ditemukan.",
          );
        if (row.revision !== input.expectedRevision) conflict();
        const current = {
          ...row,
          effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
          effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
        };
        const { before, after, fields } = prepareOfficialCorrection(
          current,
          input,
          now,
        );
        // Assignment and audit share one transaction; exclusion/check/FK failures roll back both.
        await tx.leaveAuthorizedOfficialAssignment.update({
          where: { id, revision: input.expectedRevision },
          data: {
            ...after,
            effectiveFrom: new Date(after.effectiveFrom),
            effectiveTo: after.effectiveTo ? new Date(after.effectiveTo) : null,
            revision: { increment: 1 },
          },
        });
        return view(
          await tx.leaveAuthorizedOfficialCorrection.create({
            data: {
              assignmentId: id,
              actorUserId,
              correctedAt: now,
              reason: input.reason,
              sourceReference: input.sourceReference,
              before: before as unknown as Prisma.InputJsonValue,
              after: after as unknown as Prisma.InputJsonValue,
              fields,
              revision: row.revision + 1,
              idempotencyKey: input.idempotencyKey,
              payloadHash,
            },
          }),
        );
      });
    } catch (error) {
      if (error instanceof LeaveAuthorizedOfficialError) throw error;
      // PostgreSQL errors may be wrapped by the Prisma pg driver adapter.
      const serialized = JSON.stringify(
        error,
        Object.getOwnPropertyNames(error instanceof Error ? error : {}),
      );
      if (/23P01|no_period_overlap|exclusion constraint/.test(serialized))
        throw new LeaveAuthorizedOfficialError(
          "OVERLAP",
          "Periode penugasan bertumpang tindih dengan pejabat cuti lain.",
        );
      if (/P2034|40001|40P01|P2025/.test(serialized)) conflict();
      throw error;
    }
  }
}
