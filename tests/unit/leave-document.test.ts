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
  it("creates a valid, one-page A4 portrait PDF", () => {
    const document = generateLeaveDocument(base, []);
    const output = Buffer.from(document).toString("latin1");
    expect(output.startsWith("%PDF-1.4")).toBe(true);
    expect(output).toContain("/MediaBox [0 0 595 842]");
    expect(output).toContain("/Count 1");
    expect(output.endsWith("%%EOF")).toBe(true);
  });

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
      "3",
      "Hari",
      "21 September 2026",
      "23 September 2026",
      "Jalan Pengujian Nomor 1",
      "+6281234567890",
      "Atasan Uji",
      "Kepala Seksi",
      String.raw`Cuti N (3 hari)`,
    ])
      expect(output).toContain(value);
    expect(output).not.toContain("2030");
    expect(output).not.toContain("Status: DISETUJUI");
  });
  it("keeps all Section II rows above Section III without shared drawing areas", () => {
    const output = raw();
    expect(output).toContain("32 568 265.5 18 re S");
    expect(output).toContain("32 552 531 16 re S");
    expect(output).toContain("1 0 0 1 35 576 Tm");
    expect(output).toContain("([ ] 5. Cuti Karena Alasan Penting) Tj");
    expect(output).toContain("1 0 0 1 35 558 Tm");
    expect(output).toContain("(III. ALASAN CUTI) Tj");
  });
  it("marks only the requested leave type and leaves all decision cells unmarked", () => {
    const output = raw();
    expect(output).toContain("[X] 1. Cuti Tahunan");
    expect(output).toContain("[ ] 2. Cuti Besar");
    expect(output.match(/\[X\]/g)).toHaveLength(1);
    expect(output).not.toMatch(/signature|stamp|tanda tangan|stempel/i);
    expect(output).not.toMatch(/\[X\].*(DISETUJUI|PERUBAHAN|DITANGGUHKAN)/);
  });

  it("keeps supervisor and configured office-head identities in visible order", () => {
    const output = Buffer.from(
      generateLeaveDocument(base, [], "proof", undefined, {
        authorizedOfficial: {
          fullName: "Pejabat Konfigurasi",
          nip: "197001012000011001",
        },
      }),
    ).toString("latin1");
    expect(output.indexOf("Kepala Seksi")).toBeLessThan(
      output.indexOf("Atasan Uji"),
    );
    expect(output.indexOf("Atasan Uji")).toBeLessThan(
      output.indexOf("NIP. 198001012000011001"),
    );
    expect(output.indexOf("Kepala Kantor Pencarian")).toBeLessThan(
      output.indexOf("Pejabat Konfigurasi"),
    );
    expect(output.indexOf("Pejabat Konfigurasi")).toBeLessThan(
      output.indexOf("NIP. 197001012000011001"),
    );
  });

  it("uses only the identified request's current submitted revision", () => {
    const requestB = {
      ...base,
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      currentRevision: {
        ...base.currentRevision,
        id: "revision-b",
        requestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        startDate: "2027-01-11",
        endDate: "2027-01-14",
        reason: "PENANDA-ALASAN-B",
        formPlace: "PENANDA-TEMPAT-B",
        leaveAddress: "PENANDA-ALAMAT-B",
      },
    } satisfies LeaveRequestRecord;
    const output = raw(base);
    for (const value of [
      "Medan",
      "Keperluan keluarga",
      "Jalan Pengujian Nomor 1",
      "21 September 2026",
      "23 September 2026",
    ])
      expect(output).toContain(value);
    for (const value of [
      requestB.currentRevision.reason,
      requestB.currentRevision.formPlace,
      requestB.currentRevision.leaveAddress,
      "11 Januari 2027",
      "14 Januari 2027",
    ])
      expect(output).not.toContain(value);
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
