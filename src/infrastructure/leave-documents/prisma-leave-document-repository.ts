import type {
  CreateLeaveDocumentInput,
  DocumentSnapshot,
  LeaveDocumentRecord,
  LeaveDocumentRepository,
  LeaveDocumentType,
} from "@/application/leave-documents/ports";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

function record(value: {
  id: string;
  leaveRequestId: string;
  revisionId: string;
  documentType: LeaveDocumentType;
  version: number;
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
  originalFileName: string | null;
  uploadedByUserId: string | null;
  uploadedAt: Date | null;
  sourceIp: string | null;
  snapshot: Prisma.JsonValue;
  generatedAt: Date;
}): LeaveDocumentRecord {
  return { ...value, snapshot: value.snapshot as DocumentSnapshot };
}

export class PrismaLeaveDocumentRepository implements LeaveDocumentRepository {
  constructor(private readonly database: PrismaClient) {}

  async create(input: CreateLeaveDocumentInput) {
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { status: string; currentRevisionNumber: number }[]
      >(
        Prisma.sql`SELECT "status", "currentRevisionNumber" FROM "LeaveRequest" WHERE "id" = ${input.leaveRequestId}::uuid FOR UPDATE`,
      );
      const revision = await tx.leaveRequestRevision.findUnique({
        where: { id: input.revisionId },
      });
      if (
        input.uploadedByUserId &&
        (!rows[0] ||
          !revision ||
          revision.leaveRequestId !== input.leaveRequestId ||
          revision.revisionNumber !== rows[0].currentRevisionNumber ||
          rows[0].status !==
            (input.documentType === "RETURN_BASIS" ? "APPROVED" : "SUBMITTED"))
      )
        throw new Error(
          "Pengajuan/revisi berubah sebelum unggahan diarsipkan.",
        );
      return record(
        await tx.leaveDocument.create({
          data: {
            ...input,
            snapshot: input.snapshot as Prisma.InputJsonObject,
          },
        }),
      );
    });
  }

  async findByRevisionAndType(
    revisionId: string,
    documentType: LeaveDocumentType,
  ) {
    const value = await this.database.leaveDocument.findFirst({
      where: { revisionId, documentType },
      orderBy: { version: "desc" },
    });
    return value ? record(value) : null;
  }

  async findById(id: string) {
    const value = await this.database.leaveDocument.findUnique({
      where: { id },
    });
    return value ? record(value) : null;
  }

  async listForLeaveRequest(leaveRequestId: string) {
    return (
      await this.database.leaveDocument.findMany({
        where: { leaveRequestId },
        orderBy: [
          { documentType: "asc" },
          { version: "desc" },
          { generatedAt: "desc" },
          { id: "asc" },
        ],
      })
    ).map(record);
  }

  async nextVersion(
    revisionId: string,
    documentType: LeaveDocumentType,
  ): Promise<number> {
    const aggregate = await this.database.leaveDocument.aggregate({
      where: { revisionId, documentType },
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }
}
