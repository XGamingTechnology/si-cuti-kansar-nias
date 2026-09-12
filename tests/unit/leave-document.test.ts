import { describe, expect, it } from "vitest";
import { generateLeaveDocument } from "@/application/workflow/leave-document";
import type {
  LeaveRequestRecord,
  TransitionRecord,
} from "@/application/workflow/ports";

const base: LeaveRequestRecord = {
  id: "11111111-2222-3333-4444-555555555555",
  employeeId: "employee-1",
  employee: {
    id: "employee-1",
    nip: "199001012020011001",
    fullName: "Pegawai Uji",
    positionTitle: "Staf",
    workUnit: "Unit Operasi",
  },
  status: "SUBMITTED",
  currentRevisionNumber: 1,
  currentRevision: {
    id: "revision-1",
    requestId: "11111111-2222-3333-4444-555555555555",
    revisionNumber: 1,
    leaveType: "ANNUAL",
    startDate: "2026-09-21",
    endDate: "2026-09-23",
    reason: "Keperluan keluarga",
    calculatedWorkingDays: 3,
    submittedAt: new Date("2026-09-12T10:00:00.000Z"),
  },
};

const approvedTransition: TransitionRecord = {
  id: "transition-1",
  requestId: base.id,
  revisionId: base.currentRevision.id,
  fromStatus: "SUBMITTED",
  toStatus: "APPROVED",
  actorUserId: "admin-1",
  reason: null,
  evidenceReference: "ARSIP-FISIK-2026-09",
  occurredAt: new Date("2026-09-12T11:00:00.000Z"),
  idempotencyKey: "approve-1",
};

describe("leave PDF document", () => {
  it("generates a proof PDF with employee and request data", () => {
    const pdf = generateLeaveDocument(
      base,
      [],
      "proof",
      new Date("2026-09-12T12:00:00.000Z"),
    );
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("BUKTI PENGAJUAN CUTI");
    expect(raw).toContain("Pegawai Uji");
    expect(raw).toContain("MENUNGGU PERSETUJUAN");
    expect(raw).toContain("Keperluan keluarga");
  });

  it("generates approved form only for an approved request", () => {
    const approved = { ...base, status: "APPROVED" as const };
    const pdf = generateLeaveDocument(
      approved,
      [approvedTransition],
      "approved",
      new Date("2026-09-12T12:00:00.000Z"),
    );
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toContain("FORMULIR PERMINTAAN DAN PEMBERIAN CUTI");
    expect(raw).toContain("[X] DISETUJUI");
    expect(raw).toContain("ARSIP-FISIK-2026-09");
  });

  it("rejects approved-form generation before approval", () => {
    expect(() => generateLeaveDocument(base, [], "approved")).toThrow(
      "Dokumen persetujuan hanya tersedia",
    );
  });
});
