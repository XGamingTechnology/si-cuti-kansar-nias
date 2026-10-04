import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  AnnualBalanceAccountState,
  AnnualBalanceMutationRepository,
  AnnualBalanceOperationRecord,
  LockedAnnualBalanceTransaction,
} from "@/application/leave-balance/ports";
import type {
  LeaveDocumentRecord,
  LeaveDocumentRepository,
} from "@/application/leave-documents/ports";
import type { LeaveAuthorizedOfficialRepository } from "@/application/leave-authorized-official/service";
import type { DocumentStorage } from "@/application/ports/document-storage";
import {
  LeaveWorkflowService,
  type LeaveRequestRecord,
  type TransitionRecord,
  type TransitionWrite,
  type WorkflowRepository,
  type WorkflowTransaction,
} from "@/application/workflow";
import type { WorkflowStatus } from "@/application/workflow/types";
import type { Principal } from "@/modules/auth/service";

const owner: Principal = {
  userId: "user-owner",
  employeeId: "employee-owner",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};

function request(
  status: WorkflowStatus = "DRAFT",
  revisionNumber = 1,
  leaveType: "SICK" | "ANNUAL" = "SICK",
): LeaveRequestRecord {
  return {
    id: "leave-1",
    employeeId: owner.employeeId,
    status,
    currentRevisionNumber: revisionNumber,
    employee: {
      id: owner.employeeId,
      nip: "UAT-EMP-001",
      fullName: "Pegawai Uji",
      positionTitle: "Staf",
      workUnit: "Unit Uji",
      employmentStartDate: "2020-01-01",
      directSupervisor: null,
    },
    currentRevision: {
      id: `leave-revision-${revisionNumber}`,
      requestId: "leave-1",
      revisionNumber,
      leaveType,
      startDate: leaveType === "ANNUAL" ? "2026-10-05" : "2026-10-08",
      endDate: leaveType === "ANNUAL" ? "2026-10-06" : "2026-10-08",
      reason: "Keperluan pengujian",
      formPlace: "Gunungsitoli",
      leaveAddress: "Alamat selama cuti",
      leavePhone: "081234567890",
      calculatedWorkingDays: null,
      submittedAt: null,
    },
  };
}

function documents() {
  const records: LeaveDocumentRecord[] = [];

  const repository: LeaveDocumentRepository = {
    create: vi.fn(async (input) => {
      const record: LeaveDocumentRecord = {
        id: `document-${records.length + 1}`,
        ...input,
      };
      records.push(record);
      return record;
    }),

    findByRevisionAndType: vi.fn(
      async (revisionId, documentType) =>
        records.find(
          (record) =>
            record.revisionId === revisionId &&
            record.documentType === documentType,
        ) ?? null,
    ),

    findById: vi.fn(
      async (id) => records.find((record) => record.id === id) ?? null,
    ),

    listForLeaveRequest: vi.fn(async (leaveRequestId) =>
      records.filter((record) => record.leaveRequestId === leaveRequestId),
    ),
  };

  return { repository, records };
}

function storage() {
  const files = new Map<string, Uint8Array>();
  const key = "a".repeat(32);

  const value: DocumentStorage = {
    put: vi.fn(async (content) => {
      files.set(key, new Uint8Array(content));

      return {
        key,
        size: content.byteLength,
        checksum: createHash("sha256").update(content).digest("hex"),
      };
    }),

    read: vi.fn(async (storageKey) => {
      const content = files.get(storageKey);
      if (!content) throw new Error("Dokumen tidak ditemukan.");
      return new Uint8Array(content);
    }),

    delete: vi.fn(async (storageKey) => {
      files.delete(storageKey);
    }),
  };

  return { value, files, key };
}

function officialRepository() {
  return {
    findEffectiveOn: vi.fn(async () => null),
  } as unknown as LeaveAuthorizedOfficialRepository;
}

function emptyBalanceRepository() {
  return {} as AnnualBalanceMutationRepository;
}

function annualBalanceRepository(): AnnualBalanceMutationRepository {
  const accounts: AnnualBalanceAccountState[] = [
    {
      id: "balance-joint",
      employeeId: owner.employeeId,
      entitlementYear: 2026,
      bucket: "JOINT_LEAVE_CLAIM",
      grantedDays: 0,
      reservedDays: 0,
      committedDays: 0,
      availableDays: 0,
    },
    {
      id: "balance-n2",
      employeeId: owner.employeeId,
      entitlementYear: 2026,
      bucket: "N2",
      grantedDays: 0,
      reservedDays: 0,
      committedDays: 0,
      availableDays: 0,
    },
    {
      id: "balance-n1",
      employeeId: owner.employeeId,
      entitlementYear: 2026,
      bucket: "N1",
      grantedDays: 0,
      reservedDays: 0,
      committedDays: 0,
      availableDays: 0,
    },
    {
      id: "balance-n",
      employeeId: owner.employeeId,
      entitlementYear: 2026,
      bucket: "N",
      grantedDays: 12,
      reservedDays: 0,
      committedDays: 0,
      availableDays: 12,
    },
  ];

  return {
    async withLockedAccounts(_employeeId, _year, _buckets, work) {
      const operations: AnnualBalanceOperationRecord[] = [];

      const transaction: LockedAnnualBalanceTransaction = {
        accounts,

        async updateCounters(input) {
          const account = accounts.find(
            (value) => value.id === input.accountId,
          );
          if (!account) throw new Error("Akun saldo tidak ditemukan.");

          return {
            ...account,
            grantedDays: input.grantedDays,
            reservedDays: input.reservedDays,
            committedDays: input.committedDays,
            availableDays:
              input.grantedDays - input.reservedDays - input.committedDays,
          };
        },

        async append(input) {
          const operation: AnnualBalanceOperationRecord = {
            id: `operation-${operations.length + 1}`,
            employeeId: input.employeeId,
            entitlementYear: input.entitlementYear,
            bucket: input.bucket,
            operationType: input.operationType,
            days: input.days,
            occurredAt: input.occurredAt,
            idempotencyKey: input.idempotencyKey,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            compensatesOperationId: input.compensatesOperationId ?? null,
            reason: input.reason ?? null,
          };

          operations.push(operation);
          return operation;
        },

        async findOperationsByReference() {
          return [];
        },

        async findReversalsForOperationIds() {
          return [];
        },
      };

      return work(transaction);
    },
  };
}

function transaction(
  leave: LeaveRequestRecord,
  documentRepository: LeaveDocumentRepository,
  balanceRepository: AnnualBalanceMutationRepository,
) {
  const appendLeaveTransition = vi.fn(
    async (input: TransitionWrite): Promise<TransitionRecord> => ({
      id: "transition-1",
      ...input,
    }),
  );

  const value = {
    annualBalanceRepository: balanceRepository,
    leaveDocumentRepository: documentRepository,
    leaveAuthorizedOfficialRepository: officialRepository(),

    lockLeaveRequest: vi.fn(async () => leave),
    findLeaveTransitionByKey: vi.fn(async () => null),
    submitLeaveRevision: vi.fn(async () => undefined),
    setLeaveStatus: vi.fn(async () => undefined),
    appendLeaveTransition,
    listCalendarOverrides: vi.fn(async () => []),
  } as unknown as WorkflowTransaction;

  return { value, appendLeaveTransition };
}

function repository(
  tx: WorkflowTransaction,
  failAfterWork = false,
): WorkflowRepository {
  return {
    transaction: vi.fn(async (work) => {
      const result = await work(tx);

      if (failAfterWork)
        throw new Error("simulated transaction commit failure");

      return result;
    }),
  } as unknown as WorkflowRepository;
}

describe("leave submission proof workflow", () => {
  it.each([
    ["DRAFT", 1],
    ["RETURNED_FOR_CORRECTION", 2],
  ] as const)(
    "freezes one SUBMISSION_PROOF when submitting from %s",
    async (status, revisionNumber) => {
      const leave = request(status, revisionNumber);
      const docs = documents();
      const privateStorage = storage();
      const tx = transaction(leave, docs.repository, emptyBalanceRepository());

      const service = new LeaveWorkflowService(
        repository(tx.value),
        privateStorage.value,
      );

      const now = new Date("2026-10-04T08:00:00.000Z");

      await expect(
        service.submit(owner, leave.id, `submit-${revisionNumber}`, now),
      ).resolves.toMatchObject({
        toStatus: "SUBMITTED",
        revisionId: leave.currentRevision.id,
      });

      expect(privateStorage.value.put).toHaveBeenCalledTimes(1);
      expect(docs.repository.create).toHaveBeenCalledTimes(1);

      expect(docs.repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leaveRequestId: leave.id,
          revisionId: leave.currentRevision.id,
          documentType: "SUBMISSION_PROOF",
          mimeType: "application/pdf",
          generatedAt: now,
          snapshot: expect.objectContaining({
            schemaVersion: 1,
            documentType: "SUBMISSION_PROOF",
            leaveRequest: expect.objectContaining({
              status: "SUBMITTED",
              revision: expect.objectContaining({
                id: leave.currentRevision.id,
                revisionNumber,
                submittedAt: now.toISOString(),
              }),
            }),
          }),
        }),
      );
    },
  );

  it("freezes annual balance values after reservation", async () => {
    const leave = request("DRAFT", 1, "ANNUAL");
    const docs = documents();
    const privateStorage = storage();
    const tx = transaction(leave, docs.repository, annualBalanceRepository());

    const service = new LeaveWorkflowService(
      repository(tx.value),
      privateStorage.value,
    );

    await service.submit(
      owner,
      leave.id,
      "annual-submit-1",
      new Date("2026-10-04T08:00:00.000Z"),
    );

    expect(docs.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          annualBalances: [
            {
              bucket: "N",
              remainingDays: 10,
              allocatedDays: 2,
            },
            {
              bucket: "N1",
              remainingDays: 0,
              allocatedDays: null,
            },
            {
              bucket: "N2",
              remainingDays: 0,
              allocatedDays: null,
            },
          ],
        }),
      }),
    );
  });

  it("deletes the stored PDF when the database transaction fails to commit", async () => {
    const leave = request();
    const docs = documents();
    const privateStorage = storage();
    const tx = transaction(leave, docs.repository, emptyBalanceRepository());

    const service = new LeaveWorkflowService(
      repository(tx.value, true),
      privateStorage.value,
    );

    await expect(
      service.submit(
        owner,
        leave.id,
        "submit-rollback-1",
        new Date("2026-10-04T08:00:00.000Z"),
      ),
    ).rejects.toThrow("simulated transaction commit failure");

    expect(privateStorage.value.put).toHaveBeenCalledTimes(1);
    expect(privateStorage.value.delete).toHaveBeenCalledWith(
      privateStorage.key,
    );
    expect(privateStorage.files.size).toBe(0);
  });
});
