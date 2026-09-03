import { describe, expect, it, vi } from "vitest";
import {
  EMPLOYEE_IMPORT_HEADERS,
  EmployeeImportService,
} from "@/application/employees/import-service";

const header = [...EMPLOYEE_IMPORT_HEADERS];
function service(rows: unknown[][], existing: string[] = []) {
  const repository = {
    findExistingNips: vi.fn(async () => existing),
    importAll: vi.fn(async () => []),
  };
  return {
    service: new EmployeeImportService(
      { read: vi.fn(async () => rows) },
      repository,
    ),
    repository,
  };
}
describe("EmployeeImportService", () => {
  it("normalizes valid workbook rows and accepted statuses", async () => {
    const result = await service([
      header,
      [" NIP-A ", " Nama Uji ", " Analis ", " Unit Uji ", "aktif"],
      ["NIP-B", "Nama B", "Staf", "Unit", "FALSE"],
    ]).service.preview(new Uint8Array());
    expect(result).toMatchObject({
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
    });
    expect(result.rows).toEqual([
      expect.objectContaining({ nip: "NIP-A", isActive: true }),
      expect.objectContaining({ nip: "NIP-B", isActive: false }),
    ]);
  });
  it("reports every required field failure at row level", async () => {
    const result = await service([
      header,
      ["", "", "", "", ""],
    ]).service.preview(new Uint8Array());
    expect(result.invalidRows).toBe(1);
    expect(result.errors).toHaveLength(5);
  });
  it("reports maximum length failures without numeric-only NIP rules", async () => {
    const result = await service([
      header,
      [
        "X".repeat(33),
        "X".repeat(201),
        "X".repeat(201),
        "X".repeat(201),
        "TRUE",
      ],
    ]).service.preview(new Uint8Array());
    expect(result.errors).toHaveLength(4);
  });
  it("rejects invalid active status", async () => {
    const result = await service([
      header,
      ["ABC/12", "Nama", "Jabatan", "Unit", "YA"],
    ]).service.preview(new Uint8Array());
    expect(result.errors[0]).toMatchObject({ field: "Status Aktif" });
  });
  it("marks every duplicate NIP occurrence", async () => {
    const result = await service([
      header,
      ["DUP", "A", "J", "U", "TRUE"],
      ["DUP", "B", "J", "U", "FALSE"],
    ]).service.preview(new Uint8Array());
    expect(result.invalidRows).toBe(2);
    expect(result.errors.filter((e) => e.field === "NIP")).toHaveLength(2);
  });
});
