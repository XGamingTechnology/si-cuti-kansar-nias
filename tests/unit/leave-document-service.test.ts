import { describe, expect, it, vi } from "vitest";
import {
  LeaveDocumentError,
  LeaveDocumentService,
  SIGNED_LEAVE_DOCUMENT_MAX_BYTES,
} from "@/application/leave-documents/service";
import type {
  CreateLeaveDocumentInput,
  LeaveDocumentRecord,
  LeaveDocumentRepository,
} from "@/application/leave-documents/ports";
import type { DocumentStorage } from "@/application/ports/document-storage";

function setup() {
  const records: LeaveDocumentRecord[] = [];
  const repository: LeaveDocumentRepository = {
    create: vi.fn(async (input: CreateLeaveDocumentInput) => {
      const record = { ...input, id: `doc-${records.length + 1}` };
      records.push(record);
      return record;
    }),
    findByRevisionAndType: vi.fn(async () => records.at(-1) ?? null),
    findById: vi.fn(async (id) => records.find((item) => item.id === id) ?? null),
    listForLeaveRequest: vi.fn(async (id) =>
      records.filter((item) => item.leaveRequestId === id),
    ),
    nextVersion: vi.fn(async () => records.length + 1),
  };
  const storage: DocumentStorage = {
    put: vi.fn(async (content) => ({
      key: "a".repeat(32),
      size: content.byteLength,
      checksum: "c".repeat(64),
    })),
    read: vi.fn(async () => new Uint8Array([1, 2, 3])),
    delete: vi.fn(async () => undefined),
  };
  return {
    records,
    repository,
    storage,
    service: new LeaveDocumentService(repository, storage),
  };
}

const pdf = () =>
  new TextEncoder().encode("%PDF-1.7\nDokumen pengujian SI CUTI");

describe("LeaveDocumentService", () => {
  it("creates append-only APPROVED_FORM metadata with checksum and version", async () => {
    const { service, storage, repository } = setup();
    const uploadedAt = new Date("2026-10-08T04:00:00.000Z");

    const result = await service.uploadApprovedForm({
      leaveRequestId: "request-1",
      revisionId: "revision-1",
      uploadedByUserId: "admin-1",
      originalFileName: "scan cuti.pdf",
      mimeType: "application/pdf",
      sourceIp: "127.0.0.1",
      content: pdf(),
      snapshot: { revisionNumber: 1 },
      now: uploadedAt,
    });

    expect(result).toMatchObject({
      documentType: "APPROVED_FORM",
      version: 1,
      originalFileName: "scan cuti.pdf",
      uploadedByUserId: "admin-1",
      uploadedAt,
      sourceIp: "127.0.0.1",
      checksumSha256: "c".repeat(64),
    });
    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("snapshot");
    expect(storage.put).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["image/png", pdf(), "Dokumen bertanda tangan harus berupa PDF yang valid."],
    ["application/pdf", new TextEncoder().encode("bukan pdf"), "Dokumen bertanda tangan harus berupa PDF yang valid."],
  ])("rejects invalid PDF input", async (mimeType, content, message) => {
    const { service, storage } = setup();
    await expect(
      service.uploadApprovedForm({
        leaveRequestId: "request-1",
        revisionId: "revision-1",
        uploadedByUserId: "admin-1",
        originalFileName: "file.pdf",
        mimeType,
        sourceIp: null,
        content,
        snapshot: {},
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", message });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it.each(["", "application/octet-stream", "binary/octet-stream"])(
    "accepts a valid PDF when the browser reports generic MIME %s",
    async (mimeType) => {
      const { service } = setup();
      await expect(
        service.uploadApprovedForm({
          leaveRequestId: "request-1",
          revisionId: "revision-1",
          uploadedByUserId: "user-1",
          originalFileName: "scan.pdf",
          mimeType,
          sourceIp: null,
          content: pdf(),
          snapshot: {},
        }),
      ).resolves.toMatchObject({
        documentType: "APPROVED_FORM",
        mimeType: "application/pdf",
      });
    },
  );

  it("rejects files above the technical size limit", async () => {
    const { service, storage } = setup();
    const content = new Uint8Array(SIGNED_LEAVE_DOCUMENT_MAX_BYTES + 1);
    content.set(new TextEncoder().encode("%PDF-"), 0);

    await expect(
      service.uploadApprovedForm({
        leaveRequestId: "request-1",
        revisionId: "revision-1",
        uploadedByUserId: "admin-1",
        originalFileName: "besar.pdf",
        mimeType: "application/pdf",
        sourceIp: null,
        content,
        snapshot: {},
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Ukuran file PDF maksimal 10 MB.",
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("removes a newly stored object if metadata persistence fails", async () => {
    const { service, repository, storage } = setup();
    vi.mocked(repository.create).mockRejectedValueOnce(new Error("duplicate"));

    await expect(
      service.uploadApprovedForm({
        leaveRequestId: "request-1",
        revisionId: "revision-1",
        uploadedByUserId: "admin-1",
        originalFileName: "scan.pdf",
        mimeType: "application/pdf",
        sourceIp: null,
        content: pdf(),
        snapshot: {},
      }),
    ).rejects.toBeInstanceOf(LeaveDocumentError);
    expect(storage.delete).toHaveBeenCalledWith("a".repeat(32));
  });

  it("prevents a document ID from being read through another request", async () => {
    const { service, repository, storage } = setup();
    vi.mocked(repository.findById).mockResolvedValueOnce({
      id: "doc-1",
      leaveRequestId: "request-owner",
      revisionId: "revision-1",
      documentType: "APPROVED_FORM",
      version: 1,
      storageKey: "a".repeat(32),
      checksumSha256: "c".repeat(64),
      sizeBytes: 3,
      mimeType: "application/pdf",
      originalFileName: "scan.pdf",
      uploadedByUserId: "admin-1",
      uploadedAt: new Date(),
      sourceIp: null,
      snapshot: {},
      generatedAt: new Date(),
    });

    await expect(
      service.readForLeaveRequest("request-other", "doc-1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.read).not.toHaveBeenCalled();
  });
});
