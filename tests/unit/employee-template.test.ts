import { describe, it, expect } from "vitest";
import { templateWorkbook } from "@/infrastructure/spreadsheet/workbook";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import {
  EmployeeImportService,
  EMPLOYEE_IMPORT_HEADERS,
} from "@/application/employees/import-service";
const reader = new XlsxWorkbookReader(true, true),
  headers = [...EMPLOYEE_IMPORT_HEADERS];
describe("Employee template safe roundtrip", () => {
  it("has no example rows and preserves long/leading-zero NIP text", async () => {
    expect(await reader.read(templateWorkbook([headers], "Pegawai"))).toEqual([
      headers,
    ]);
    const nip = "000012345678901234567890123456";
    expect(
      (
        await reader.read(
          templateWorkbook(
            [headers, [nip, "Sintetis", "Uji", "Unit", "AKTIF"]],
            "Pegawai",
          ),
        )
      )[1]?.[0],
    ).toBe(nip);
    expect(Buffer.from(templateWorkbook([headers])).toString()).toContain(
      'numFmtId="49"',
    );
  });
  it("rejects numeric NIP cells rather than silently rounding or losing zeros", async () => {
    await expect(
      reader.read(
        templateWorkbook([
          headers,
          [1234567890123456, "Sintetis", "Uji", "Unit", "AKTIF"],
        ]),
      ),
    ).rejects.toThrow("NIP bertipe teks");
  });
  it("caps preview rows before querying existing NIPs", async () => {
    let queried = false;
    const repository = {
      findExistingNips: async () => {
        queried = true;
        return [];
      },
      importAll: async () => [],
    };
    const service = new EmployeeImportService(
      {
        read: async () => [
          headers,
          ...Array.from({ length: 501 }, (_, i) => [
            String(i),
            "Sintetis",
            "Uji",
            "Unit",
            "TRUE",
          ]),
        ],
      },
      repository,
    );
    await expect(service.preview(new Uint8Array())).rejects.toThrow("500");
    expect(queried).toBe(false);
  });
});
