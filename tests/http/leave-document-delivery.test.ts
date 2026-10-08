import { describe, expect, it, vi } from "vitest";
import { createLeaveDocumentCollectionHandlers } from "@/application/leave-documents/delivery";
import type { LeaveDocumentMetadata } from "@/application/leave-documents/service";
import { WorkflowError } from "@/application/workflow/types";
import type { Principal } from "@/modules/auth/service";
import type { LeaveDocumentRuntime } from "@/infrastructure/leave-documents/runtime";

const pegawai: Principal = {
  userId: "user-1",
  employeeId: "employee-1",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};
const admin: Principal = {
  userId: "admin-1",
  employeeId: "employee-admin",
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};

const leaveRecord = {
  id: "request-1",
  employeeId: "employee-1",
  status: "SUBMITTED",
  currentRevisionNumber: 1,
  currentRevision: {
    id: "revision-1",
    requestId: "request-1",
    revisionNumber: 1,
    leaveType: "ANNUAL",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    reason: "Uji dokumen",
    formPlace: "Gunungsitoli",
    leaveAddress: "Alamat uji",
    leavePhone: "081234",
    calculatedWorkingDays: 1,
    submittedAt: new Date("2026-10-08T03:00:00.000Z"),
  },
  employee: {
    id: "employee-1",
    nip: "TEST-001",
    fullName: "Pegawai Uji",
    positionTitle: "Jabatan Uji",
    workUnit: "Unit Uji",
    directSupervisor: null,
  },
} as const;

function runtime(principal: Principal | null) {
  const leave = {
    get: vi.fn(async () => leaveRecord),
  };
  const documents = {
    listForLeaveRequest: vi.fn(
      async (): Promise<LeaveDocumentMetadata[]> => [],
    ),
    uploadApprovedForm: vi.fn(async () => ({
      id: "doc-1",
      leaveRequestId: "request-1",
      revisionId: "revision-1",
      documentType: "APPROVED_FORM",
      version: 1,
      checksumSha256: "a".repeat(64),
      sizeBytes: 12,
      mimeType: "application/pdf",
      originalFileName: "scan.pdf",
      uploadedByUserId: "admin-1",
      uploadedAt: new Date(),
      sourceIp: null,
      generatedAt: new Date(),
    })),
    readForLeaveRequest: vi.fn(),
  };
  const value = {
    authentication: { validate: vi.fn(async () => principal) },
    leave,
    documents,
    database: { $disconnect: vi.fn(async () => undefined) },
  };
  return { value: value as unknown as LeaveDocumentRuntime, leave, documents };
}

const context = { params: Promise.resolve({ id: "request-1" }) };
const getRequest = () =>
  new Request("http://localhost/api/workflow/leave/request-1/documents", {
    headers: { cookie: "si_cuti_session=opaque" },
  });

describe("signed leave document HTTP delivery", () => {
  it("rejects unauthenticated document listing", async () => {
    const mock = runtime(null);
    const response = await createLeaveDocumentCollectionHandlers(
      () => mock.value,
    ).GET(getRequest(), context);
    expect(response.status).toBe(401);
    expect(mock.documents.listForLeaveRequest).not.toHaveBeenCalled();
  });

  it("keeps owner isolation at the leave workflow boundary", async () => {
    const mock = runtime(pegawai);
    mock.leave.get.mockRejectedValueOnce(
      new WorkflowError("FORBIDDEN", "Forbidden"),
    );
    const response = await createLeaveDocumentCollectionHandlers(
      () => mock.value,
    ).GET(getRequest(), context);
    expect(response.status).toBe(403);
    expect(mock.leave.get).toHaveBeenCalledWith(pegawai, "request-1");
    expect(mock.documents.listForLeaveRequest).not.toHaveBeenCalled();
  });

  it("allows an authorized employee to list metadata without storage keys", async () => {
    const mock = runtime(pegawai);
    const metadata = {
      id: "doc-1",
      leaveRequestId: "request-1",
      revisionId: "revision-1",
      documentType: "APPROVED_FORM",
      version: 1,
      checksumSha256: "a".repeat(64),
      sizeBytes: 12,
      mimeType: "application/pdf",
      originalFileName: "scan.pdf",
      uploadedByUserId: "admin-1",
      uploadedAt: new Date("2026-10-08T04:00:00Z"),
      sourceIp: null,
      generatedAt: new Date("2026-10-08T04:00:00Z"),
    };
    mock.documents.listForLeaveRequest.mockResolvedValueOnce([
      metadata as LeaveDocumentMetadata,
    ]);

    const response = await createLeaveDocumentCollectionHandlers(
      () => mock.value,
    ).GET(getRequest(), context);
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("storageKey");
  });

  it("forbids Pegawai from uploading a signed final PDF", async () => {
    const mock = runtime(pegawai);
    const form = new FormData();
    form.set(
      "file",
      new File(["%PDF-1.7 test"], "scan.pdf", { type: "application/pdf" }),
    );
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { cookie: "si_cuti_session=opaque" },
      body: form,
    });

    const response = await createLeaveDocumentCollectionHandlers(
      () => mock.value,
    ).POST(request, context);
    expect(response.status).toBe(403);
    expect(mock.documents.uploadApprovedForm).not.toHaveBeenCalled();
  });

  it("lets Admin archive a submitted signed PDF", async () => {
    const mock = runtime(admin);
    const form = new FormData();
    form.set(
      "file",
      new File(["%PDF-1.7 test"], "scan.pdf", { type: "application/pdf" }),
    );
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: {
        cookie: "si_cuti_session=opaque",
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      },
      body: form,
    });

    const response = await createLeaveDocumentCollectionHandlers(
      () => mock.value,
    ).POST(request, context);
    expect(response.status).toBe(201);
    expect(mock.documents.uploadApprovedForm).toHaveBeenCalledWith(
      expect.objectContaining({
        leaveRequestId: "request-1",
        revisionId: "revision-1",
        uploadedByUserId: "admin-1",
        originalFileName: "scan.pdf",
        mimeType: "application/pdf",
        sourceIp: "10.0.0.1",
      }),
    );
  });
});
