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
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
  snapshot: Prisma.JsonValue;
  generatedAt: Date;
}): LeaveDocumentRecord {
  return { ...value, snapshot: value.snapshot as DocumentSnapshot };
}

export class PrismaLeaveDocumentRepository implements LeaveDocumentRepository {
  constructor(private readonly database: PrismaClient) {}

  async create(input: CreateLeaveDocumentInput) {
    return record(
      await this.database.leaveDocument.create({
        data: {
          ...input,
          snapshot: input.snapshot as Prisma.InputJsonObject,
        },
      }),
    );
  }

  async findByRevisionAndType(
    revisionId: string,
    documentType: LeaveDocumentType,
  ) {
    const value = await this.database.leaveDocument.findUnique({
      where: { revisionId_documentType: { revisionId, documentType } },
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
        orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
      })
    ).map(record);
  }
}
