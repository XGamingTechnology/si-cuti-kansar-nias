import { describe, expect, it } from "vitest";
import {
  calculateIndonesianTenure,
  generateLeaveDocument,
} from "@/application/workflow/leave-document";
import type { LeaveRequestRecord } from "@/application/workflow/ports";

const base: LeaveRequestRecord = {
  id: "11111111-2222-3333-4444-555555555555",
  employeeId: "employee-1",
  employee: {
    id: "employee-1",
    nip: "199001012020011001",
    fullName: "Pegawai Uji",
    positionTitle: "Staf",
    workUnit: "Unit Operasi",
    employmentStartDate: "2023-03-12",
    directSupervisor: {
      fullName: "Atasan Uji",
      nip: "198001012000011001",
      positionTitle: "Kepala Seksi",
    },
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
    formPlace: "Medan",
    leaveAddress: "Jalan Pengujian Nomor 1",
    leavePhone: "+6281234567890",
    calculatedWorkingDays: 3,
    submittedAt: new Date("2026-09-12T10:00:00.000Z"),
  },
};
const raw = (request = base, generatedAt = new Date("2030-01-01")) =>
  Buffer.from(
    generateLeaveDocument(request, [], "proof", generatedAt, {
      annualBalances: [
        { bucket: "N", remainingDays: 9, allocatedDays: 3 },
        { bucket: "N1", remainingDays: 2 },
        { bucket: "N2", remainingDays: 0 },
      ],
    }),
  ).toString("latin1");

describe("official pre-signature leave form", () => {
  it("renders deterministic submission data, fixed recipient, employee, supervisor and ledger input", () => {
    const output = raw();
    for (const value of [
      "FORMULIR PERMINTAAN DAN PEMBERIAN CUTI",
      "Medan, 12 September 2026",
      "Gunungsitoli",
      "Pegawai Uji",
      "199001012020011001",
      "Staf",
      "Unit Operasi",
      "3 Tahun 6 Bulan",
      "Keperluan keluarga",
      "3 | Hari",
      "Jalan Pengujian Nomor 1",
      "+6281234567890",
      "Atasan Uji",
      "Kepala Seksi",
      String.raw`Cuti N \(3 hari\)`,
    ])
      expect(output).toContain(value);
    expect(output).not.toContain("2030");
    expect(output).not.toContain("Status: DISETUJUI");
  });
  it("marks only the requested leave type and leaves all decision cells unmarked", () => {
    const output = raw();
    expect(output).toContain("[X] 1. Cuti Tahunan");
    expect(output).toContain("[ ] 2. Cuti Besar");
    expect(output.match(/\[X\]/g)).toHaveLength(1);
    expect(output).not.toMatch(/signature|stamp|tanda tangan|stempel/i);
  });
  it("does not fabricate missing master or balance data", () => {
    const request = {
      ...base,
      employee: {
        ...base.employee,
        employmentStartDate: null,
        directSupervisor: null,
      },
    };
    const output = Buffer.from(
      generateLeaveDocument(request, [], "proof"),
    ).toString("latin1");
    expect(output).toContain("Belum tersedia");
    expect(output).toContain("Atasan langsung belum ditetapkan");
    expect(output).toContain("Nama pejabat belum dikonfigurasi");
  });
  it.each([
    ["2025-03-12", "1 Tahun 6 Bulan"],
    ["2026-01-12", "8 Bulan"],
    ["2023-09-12", "3 Tahun"],
  ])("calculates tenure from %s", (start, expected) =>
    expect(
      calculateIndonesianTenure(start, new Date("2026-09-12T10:00:00Z")),
    ).toBe(expected),
  );
});
