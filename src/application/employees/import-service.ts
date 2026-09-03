import { EmployeeError, type Employee } from "./service";

export const EMPLOYEE_IMPORT_HEADERS = [
  "NIP",
  "Nama Lengkap",
  "Jabatan",
  "Unit Kerja",
  "Status Aktif",
] as const;

export type EmployeeImportRow = Readonly<{
  rowNumber: number;
  nip: string;
  fullName: string;
  positionTitle: string;
  workUnit: string;
  isActive: boolean;
}>;
export type EmployeeImportError = Readonly<{
  rowNumber: number;
  nip: string;
  field: string;
  message: string;
}>;
export type EmployeeImportPreview = Readonly<{
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: EmployeeImportRow[];
  errors: EmployeeImportError[];
}>;

export interface EmployeeWorkbookReader {
  read(buffer: Uint8Array): Promise<readonly (readonly unknown[])[]>;
}
export interface EmployeeImportRepository {
  findExistingNips(nips: readonly string[]): Promise<readonly string[]>;
  importAll(
    rows: readonly Omit<EmployeeImportRow, "rowNumber">[],
  ): Promise<Employee[]>;
}

const fields = ["NIP", "Nama Lengkap", "Jabatan", "Unit Kerja"] as const;
const max = [32, 200, 200, 200] as const;
const statusValues = new Map<string, boolean>([
  ["TRUE", true],
  ["AKTIF", true],
  ["FALSE", false],
  ["TIDAK AKTIF", false],
]);
const text = (value: unknown) => (value == null ? "" : String(value).trim());

export class EmployeeImportService {
  constructor(
    private readonly reader: EmployeeWorkbookReader,
    private readonly repository: EmployeeImportRepository,
  ) {}

  async preview(buffer: Uint8Array): Promise<EmployeeImportPreview> {
    const sheet = await this.reader.read(buffer);
    const header = sheet[0]?.map(text) ?? [];
    if (
      header.length !== EMPLOYEE_IMPORT_HEADERS.length ||
      EMPLOYEE_IMPORT_HEADERS.some((value, index) => header[index] !== value)
    )
      throw new EmployeeError(
        "VALIDATION",
        `Header harus persis: ${EMPLOYEE_IMPORT_HEADERS.join(", ")}.`,
      );

    const source = sheet
      .slice(1)
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => row.some((cell) => text(cell)));
    const errors: EmployeeImportError[] = [];
    const candidates: EmployeeImportRow[] = [];
    const occurrences = new Map<string, number[]>();
    for (const { rowNumber, row: raw } of source) {
      const values = raw.slice(0, 5).map(text);
      const nip = values[0] ?? "";
      for (let field = 0; field < 4; field++) {
        if (!values[field])
          errors.push({
            rowNumber,
            nip,
            field: fields[field],
            message: `${fields[field]} wajib diisi.`,
          });
        else if (values[field].length > max[field])
          errors.push({
            rowNumber,
            nip,
            field: fields[field],
            message: `${fields[field]} maksimal ${max[field]} karakter.`,
          });
      }
      const normalizedStatus = (values[4] ?? "")
        .toUpperCase()
        .replace(/\s+/g, " ");
      if (!normalizedStatus)
        errors.push({
          rowNumber,
          nip,
          field: "Status Aktif",
          message: "Status Aktif wajib diisi.",
        });
      else if (!statusValues.has(normalizedStatus))
        errors.push({
          rowNumber,
          nip,
          field: "Status Aktif",
          message: "Gunakan TRUE, FALSE, AKTIF, atau TIDAK AKTIF.",
        });
      occurrences.set(nip, [...(occurrences.get(nip) ?? []), rowNumber]);
      candidates.push({
        rowNumber,
        nip,
        fullName: values[1] ?? "",
        positionTitle: values[2] ?? "",
        workUnit: values[3] ?? "",
        isActive: statusValues.get(normalizedStatus) ?? false,
      });
    }
    for (const [nip, rowNumbers] of occurrences)
      if (nip && rowNumbers.length > 1)
        for (const rowNumber of rowNumbers)
          errors.push({
            rowNumber,
            nip,
            field: "NIP",
            message: "NIP duplikat di dalam file.",
          });
    const existing = new Set(
      await this.repository.findExistingNips(
        [...occurrences.keys()].filter(Boolean),
      ),
    );
    for (const row of candidates)
      if (existing.has(row.nip))
        errors.push({
          rowNumber: row.rowNumber,
          nip: row.nip,
          field: "NIP",
          message: "NIP sudah terdaftar.",
        });
    const invalid = new Set(errors.map((error) => error.rowNumber));
    return {
      totalRows: candidates.length,
      validRows: candidates.length - invalid.size,
      invalidRows: invalid.size,
      rows: candidates,
      errors,
    };
  }

  async commit(buffer: Uint8Array): Promise<Employee[]> {
    const preview = await this.preview(buffer);
    if (preview.errors.length)
      throw new EmployeeError(
        "VALIDATION",
        "Impor dibatalkan karena masih ada baris yang tidak valid.",
      );
    if (!preview.rows.length)
      throw new EmployeeError(
        "VALIDATION",
        "Workbook tidak memiliki data pegawai.",
      );
    return this.repository.importAll(
      preview.rows.map(({ rowNumber: _, ...row }) => row),
    );
  }
}
