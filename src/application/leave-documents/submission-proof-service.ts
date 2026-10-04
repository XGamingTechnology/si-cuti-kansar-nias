import { createHash } from "node:crypto";

import type {
  DocumentSnapshot,
  LeaveDocumentRecord,
  LeaveDocumentRepository,
} from "@/application/leave-documents/ports";
import type { DocumentStorage } from "@/application/ports/document-storage";
import {
  generateLeaveDocument,
  type AnnualLeaveFormBalance,
  type LeaveFormOptions,
} from "@/application/workflow/leave-document";
import type { LeaveRequestRecord } from "@/application/workflow/ports";

export type LeaveSubmissionProofInput = Readonly<{
  request: LeaveRequestRecord;
  annualBalances?: readonly AnnualLeaveFormBalance[];
  authorizedOfficial?: LeaveFormOptions["authorizedOfficial"];
  generatedAt?: Date;
}>;

export type StoredLeaveSubmissionProof = Readonly<{
  record: LeaveDocumentRecord;
  content: Uint8Array;
}>;

function buildSnapshot(
  input: LeaveSubmissionProofInput,
  generatedAt: Date,
): DocumentSnapshot {
  const request = input.request;
  const revision = request.currentRevision;

  if (!revision.submittedAt)
    throw new Error(
      "Formulir hanya tersedia untuk revisi yang telah diajukan.",
    );

  return {
    schemaVersion: 1,
    documentType: "SUBMISSION_PROOF",
    generatedAt: generatedAt.toISOString(),
    leaveRequest: {
      id: request.id,
      employeeId: request.employeeId,
      status: request.status,
      employee: {
        id: request.employee.id,
        nip: request.employee.nip,
        fullName: request.employee.fullName,
        positionTitle: request.employee.positionTitle,
        workUnit: request.employee.workUnit,
        employmentStartDate: request.employee.employmentStartDate ?? null,
        directSupervisor: request.employee.directSupervisor
          ? {
              nip: request.employee.directSupervisor.nip,
              fullName: request.employee.directSupervisor.fullName,
              positionTitle: request.employee.directSupervisor.positionTitle,
            }
          : null,
      },
      revision: {
        id: revision.id,
        requestId: revision.requestId,
        revisionNumber: revision.revisionNumber,
        leaveType: revision.leaveType,
        startDate: revision.startDate,
        endDate: revision.endDate,
        reason: revision.reason,
        formPlace: revision.formPlace ?? null,
        leaveAddress: revision.leaveAddress ?? null,
        leavePhone: revision.leavePhone ?? null,
        calculatedWorkingDays: revision.calculatedWorkingDays,
        submittedAt: revision.submittedAt.toISOString(),
      },
    },
    annualBalances: (input.annualBalances ?? []).map((balance) => ({
      bucket: balance.bucket,
      remainingDays: balance.remainingDays,
      allocatedDays: balance.allocatedDays ?? null,
    })),
    authorizedOfficial: input.authorizedOfficial
      ? {
          fullName: input.authorizedOfficial.fullName,
          nip: input.authorizedOfficial.nip,
          capacity: input.authorizedOfficial.capacity,
        }
      : null,
  };
}

function sha256(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

export class LeaveSubmissionProofService {
  constructor(
    private readonly repository: LeaveDocumentRepository,
    private readonly storage: DocumentStorage,
  ) {}

  async ensure(input: LeaveSubmissionProofInput): Promise<LeaveDocumentRecord> {
    const revision = input.request.currentRevision;

    if (!revision.submittedAt)
      throw new Error(
        "Formulir hanya tersedia untuk revisi yang telah diajukan.",
      );

    const existing = await this.repository.findByRevisionAndType(
      revision.id,
      "SUBMISSION_PROOF",
    );
    if (existing) return existing;

    const generatedAt = input.generatedAt ?? new Date();
    const snapshot = buildSnapshot(input, generatedAt);

    const content = generateLeaveDocument(
      input.request,
      [],
      "proof",
      generatedAt,
      {
        annualBalances: input.annualBalances,
        authorizedOfficial: input.authorizedOfficial,
      },
    );

    const stored = await this.storage.put(content);

    try {
      return await this.repository.create({
        leaveRequestId: input.request.id,
        revisionId: revision.id,
        documentType: "SUBMISSION_PROOF",
        storageKey: stored.key,
        checksumSha256: stored.checksum,
        sizeBytes: stored.size,
        mimeType: "application/pdf",
        snapshot,
        generatedAt,
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);

      const concurrent = await this.repository.findByRevisionAndType(
        revision.id,
        "SUBMISSION_PROOF",
      );
      if (concurrent) return concurrent;

      throw error;
    }
  }

  async read(revisionId: string): Promise<StoredLeaveSubmissionProof | null> {
    const record = await this.repository.findByRevisionAndType(
      revisionId,
      "SUBMISSION_PROOF",
    );
    if (!record) return null;

    const content = await this.storage.read(record.storageKey);

    if (
      content.byteLength !== record.sizeBytes ||
      sha256(content) !== record.checksumSha256
    )
      throw new Error("Integritas dokumen cuti tidak valid.");

    return { record, content };
  }
}
