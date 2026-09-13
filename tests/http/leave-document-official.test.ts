import { describe, expect, it, vi } from "vitest";
import { createLeaveDocumentHandler } from "@/app/api/workflow/leave/[id]/document/route";
import type { LeaveRequestRecord } from "@/application/workflow/ports";
import type { Principal } from "@/modules/auth/service";

const submittedAt = new Date("2026-09-13T10:00:00.000Z");
const leave: LeaveRequestRecord = {
  id: "11111111-2222-3333-4444-555555555555",
  employeeId: "employee-1",
  employee: {
    id: "employee-1",
    nip: "000000000000000010",
    fullName: "Pegawai Fiktif",
    positionTitle: "Staf Uji",
    workUnit: "Unit Uji",
    employmentStartDate: null,
    directSupervisor: null,
  },
  status: "SUBMITTED",
  currentRevisionNumber: 1,
  currentRevision: {
    id: "revision-1",
    requestId: "11111111-2222-3333-4444-555555555555",
    revisionNumber: 1,
    leaveType: "SICK",
    startDate: "2026-09-14",
    endDate: "2026-09-14",
    reason: "Pengujian dokumen",
    formPlace: "Kota Uji",
    leaveAddress: "Alamat Uji",
    leavePhone: "000",
    calculatedWorkingDays: 1,
    submittedAt,
  },
};
const principal: Principal = {
  userId: "user-1",
  employeeId: "employee-1",
  fullName: "Pegawai Fiktif",
  role: "PEGAWAI",
};
function runtime(official: object | null) {
  return {
    authentication: { validate: vi.fn(async () => principal) },
    leave: { get: vi.fn(async () => leave) },
    officials: { resolve: vi.fn(async () => official) },
    database: { $disconnect: vi.fn() },
  };
}
const request = () =>
  new Request(
    "http://localhost/api/workflow/leave/11111111-2222-3333-4444-555555555555/document?download=1",
    { headers: { cookie: "si_cuti_session=token" } },
  );
const context = {
  params: Promise.resolve({ id: "11111111-2222-3333-4444-555555555555" }),
};

describe("leave document official resolution", () => {
  it("uses the revision submission timestamp even when downloaded later", async () => {
    const dependencies = runtime({
      fullName: "Pejabat A Fiktif",
      nip: "000000000000000001",
      capacity: "DEFINITIVE",
    });
    const response = await createLeaveDocumentHandler(
      () => dependencies as never,
    )(request(), context);
    const output = Buffer.from(await response.arrayBuffer()).toString("latin1");
    expect(dependencies.officials.resolve).toHaveBeenCalledWith(submittedAt);
    expect(output).toContain("Pejabat A Fiktif");
    expect(output).not.toContain("Pejabat B Fiktif");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("renders a neutral placeholder when no historical master exists", async () => {
    const response = await createLeaveDocumentHandler(
      () => runtime(null) as never,
    )(request(), context);
    const output = Buffer.from(await response.arrayBuffer()).toString("latin1");
    expect(output).toContain("Nama pejabat belum dikonfigurasi");
    expect(output).toContain("NIP. -");
  });
});
