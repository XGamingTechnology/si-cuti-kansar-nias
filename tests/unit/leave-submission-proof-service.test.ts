import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  CreateLeaveDocumentInput,
  LeaveDocumentRecord,
  LeaveDocumentRepository,
} from "@/application/leave-documents/ports";
import { LeaveSubmissionProofService } from "@/application/leave-documents/submission-proof-service";
import type { DocumentStorage } from "@/application/ports/document-storage";
import type { LeaveRequestRecord } from "@/application/workflow/ports";

const request: LeaveRequestRecord = {
  id: "request-1",
  employeeId: "employee-1",
  status: "SUBMITTED",
  currentRevisionNumber: 1,
  employee: {
    id: "employee-1",
    nip: "198001012006041001",
    fullName: "Pegawai Uji",
    positionTitle: "Penata Kelola",
    workUnit: "Kantor Pencarian dan Pertolongan Kelas B Nias",
    employmentStartDate: "2016-01-01",
    directSupervisor: {
      nip: "197001012000011001",
      fullName: "Atasan Uji",
      positionTitle: "Kepala Seksi",
    },
  },
  currentRevision: {
    id: "revision-1",
    requestId: "request-1",
    revisionNumber: 1,
    leaveType: "ANNUAL",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    reason: "Keperluan keluarga",
    formPlace: "Gunungsitoli",
    leaveAddress: "Alamat selama cuti",
    leavePhone: "081234567890",
    calculatedWorkingDays: 3,
    submittedAt: new Date("2026-10-03T10:00:00.000Z"),
  },
};

function setup() {
  const records: LeaveDocumentRecord[] = [];
  const files = new Map<string, Uint8Array>();
  let keyNumber = 0;

  const repository: LeaveDocumentRepository = {
    create: vi.fn(async (input: CreateLeaveDocumentInput) => {
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

  const storage: DocumentStorage = {
    put: vi.fn(async (content) => {
      keyNumber += 1;
      const key = keyNumber.toString(16).padStart(32, "0");
      files.set(key, new Uint8Array(content));

      return {
        key,
        size: content.byteLength,
        checksum: createHash("sha256").update(content).digest("hex"),
      };
    }),
    read: vi.fn(async (key) => {
      const content = files.get(key);
      if (!content) throw new Error("Dokumen tidak ditemukan.");
      return new Uint8Array(content);
    }),
    delete: vi.fn(async (key) => {
      files.delete(key);
    }),
  };

  return {
    repository,
    storage,
    files,
    service: new LeaveSubmissionProofService(repository, storage),
  };
}

describe("LeaveSubmissionProofService", () => {
  it("membekukan PDF dan snapshot untuk revisi yang telah diajukan", async () => {
    const { repository, storage, service } = setup();
    const generatedAt = new Date("2026-10-03T10:00:01.000Z");

    const record = await service.ensure({
      request,
      generatedAt,
      annualBalances: [
        {
          bucket: "N",
          remainingDays: 7,
          allocatedDays: 3,
        },
      ],
      authorizedOfficial: {
        fullName: "Pejabat Uji",
        nip: "196501011990011001",
        capacity: "DEFINITIVE",
      },
    });

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(record.documentType).toBe("SUBMISSION_PROOF");
    expect(record.mimeType).toBe("application/pdf");
    expect(record.sizeBytes).toBeGreaterThan(0);
    expect(record.snapshot).toMatchObject({
      schemaVersion: 1,
      documentType: "SUBMISSION_PROOF",
      generatedAt: generatedAt.toISOString(),
      leaveRequest: {
        id: "request-1",
        employee: {
          fullName: "Pegawai Uji",
        },
        revision: {
          id: "revision-1",
          revisionNumber: 1,
          submittedAt: "2026-10-03T10:00:00.000Z",
        },
      },
      annualBalances: [
        {
          bucket: "N",
          remainingDays: 7,
          allocatedDays: 3,
        },
      ],
      authorizedOfficial: {
        fullName: "Pejabat Uji",
        capacity: "DEFINITIVE",
      },
    });
  });

  it("tidak membuat ulang dokumen untuk revisi yang sama", async () => {
    const { repository, storage, service } = setup();

    const first = await service.ensure({ request });
    const second = await service.ensure({ request });

    expect(second).toEqual(first);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it("membaca file immutable dan memverifikasi checksum", async () => {
    const { files, service } = setup();

    const record = await service.ensure({ request });
    const stored = await service.read("revision-1");

    expect(stored?.record).toEqual(record);
    expect(stored?.content.byteLength).toBe(record.sizeBytes);

    files.set(
      record.storageKey,
      new TextEncoder().encode("dokumen telah berubah"),
    );

    await expect(service.read("revision-1")).rejects.toThrow(
      "Integritas dokumen cuti tidak valid.",
    );
  });

  it("membersihkan file kedua jika terjadi race uniqueness", async () => {
    const existing: LeaveDocumentRecord = {
      id: "document-existing",
      leaveRequestId: "request-1",
      revisionId: "revision-1",
      documentType: "SUBMISSION_PROOF",
      storageKey: "f".repeat(32),
      checksumSha256: "a".repeat(64),
      sizeBytes: 100,
      mimeType: "application/pdf",
      snapshot: { schemaVersion: 1 },
      generatedAt: new Date("2026-10-03T10:00:01.000Z"),
    };

    const repository: LeaveDocumentRepository = {
      create: vi.fn().mockRejectedValue(new Error("unique constraint")),
      findByRevisionAndType: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing),
      findById: vi.fn(),
      listForLeaveRequest: vi.fn(),
    };

    const storage: DocumentStorage = {
      put: vi.fn().mockResolvedValue({
        key: "e".repeat(32),
        size: 123,
        checksum: "b".repeat(64),
      }),
      read: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const service = new LeaveSubmissionProofService(repository, storage);
    const result = await service.ensure({ request });

    expect(result).toEqual(existing);
    expect(storage.delete).toHaveBeenCalledWith("e".repeat(32));
  });
});
