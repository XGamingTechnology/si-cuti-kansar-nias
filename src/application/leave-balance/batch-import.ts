import { createHash } from "node:crypto";
import { z } from "zod";
import type { EmployeeWorkbookReader } from "@/application/employees/import-service";
import {
  AnnualBalanceAdministrationError,
  AnnualBalanceAdministrationService,
  annualBalanceReadiness,
  requireAnnualBalanceYear,
  validateOpeningBalanceValues,
  type AnnualBalanceAdministrationRepository,
  type AnnualBalanceEmployee,
} from "./administration";

export const BALANCE_IMPORT_HEADERS = [
  "NIP",
  "Nama Pegawai",
  "Tahun",
  "N",
  "N-1",
  "N-2",
  "Cuti Bersama",
  "Dasar Administrasi",
] as const;
export const MAX_BALANCE_IMPORT_ROWS = 1000;
export interface BalanceImportEmployeeLookup {
  findEmployeesByNips(
    nips: readonly string[],
  ): Promise<readonly AnnualBalanceEmployee[]>;
}
export type BalanceImportRow = Readonly<{
  rowNumber: number;
  nip: string;
  fullName: string;
  entitlementYear: number;
  n1Days: number | null;
  n2Days: number | null;
  reason: string;
  employeeId: string | null;
  status: "READY" | "SKIP" | "ERROR";
  messages: readonly string[];
}>;
export type BalanceImportPreview = Readonly<{
  digest: string;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  errorRows: number;
  rows: readonly BalanceImportRow[];
}>;
export type BalanceImportResultRow = Omit<BalanceImportRow, "status"> &
  Readonly<{
    status: "SUCCEEDED" | "SKIP" | "FAILED";
  }>;
export type BalanceImportResult = Readonly<{
  batchId: string;
  succeededRows: number;
  skippedRows: number;
  failedRows: number;
  rows: readonly BalanceImportResultRow[];
}>;
const text = (value: unknown) => (value == null ? "" : String(value).trim());
// Empty, fractional, exponent and formula cells are never coerced into opening days.
const integer = (value: string) =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : Number.NaN;
const validation = (message: string) =>
  new AnnualBalanceAdministrationError("VALIDATION", message);
const digest = (bytes: Uint8Array, year: number) =>
  createHash("sha256").update(String(year)).update(bytes).digest("hex");

export class AnnualBalanceBatchImportService {
  private readonly administration: AnnualBalanceAdministrationService;
  constructor(
    private readonly reader: EmployeeWorkbookReader,
    private readonly repository: AnnualBalanceAdministrationRepository &
      BalanceImportEmployeeLookup,
  ) {
    this.administration = new AnnualBalanceAdministrationService(repository);
  }

  async template(
    year: number,
  ): Promise<readonly (readonly (string | number)[])[]> {
    requireAnnualBalanceYear(year);
    return [
      BALANCE_IMPORT_HEADERS,
      ...(await this.repository.listActiveEmployees()).map((employee) => [
        employee.nip,
        employee.fullName,
        year,
        12,
        "",
        "",
        0,
        "",
      ]),
    ];
  }

  async preview(
    bytes: Uint8Array,
    selectedYear: number,
  ): Promise<BalanceImportPreview> {
    const year = requireAnnualBalanceYear(selectedYear);
    const sheet = await this.reader.read(bytes);
    const header = sheet[0]?.map(text) ?? [];
    if (
      header.length !== BALANCE_IMPORT_HEADERS.length ||
      BALANCE_IMPORT_HEADERS.some((value, i) => header[i] !== value)
    )
      throw validation(
        `Header harus persis: ${BALANCE_IMPORT_HEADERS.join(", ")}.`,
      );
    const source = sheet
      .slice(1)
      .map((row, i) => ({ cells: Array.from(row, text), rowNumber: i + 2 }))
      .filter(({ cells }) => cells.some(Boolean));
    if (!source.length) throw validation("Workbook tidak memiliki data saldo.");
    if (source.length > MAX_BALANCE_IMPORT_ROWS)
      throw validation(`Maksimal ${MAX_BALANCE_IMPORT_ROWS} baris per impor.`);
    const occurrences = new Map<string, number>();
    for (const { cells } of source) {
      const nip = cells[0] ?? "";
      occurrences.set(nip, (occurrences.get(nip) ?? 0) + 1);
    }
    const employees = new Map(
      (
        await this.repository.findEmployeesByNips(
          [...occurrences.keys()].filter(Boolean),
        )
      ).map((employee) => [employee.nip, employee]),
    );
    const rows: BalanceImportRow[] = [];
    for (const { cells, rowNumber } of source) {
      const nip = cells[0] ?? "";
      const employee = employees.get(nip);
      const n1Days = integer(cells[4] ?? "");
      const n2Days = integer(cells[5] ?? "");
      const reason = cells[7] ?? "";
      const messages: string[] = [];
      if (!nip || nip.length > 32)
        messages.push("NIP wajib diisi dan maksimal 32 karakter.");
      if ((occurrences.get(nip) ?? 0) > 1)
        messages.push("NIP/pegawai-tahun duplikat di dalam file.");
      if (!employee) messages.push("Pegawai tidak ditemukan.");
      else if (!employee.isActive) messages.push("Pegawai tidak aktif.");
      if (integer(cells[2] ?? "") !== year)
        messages.push("Tahun harus sama dengan tahun administrasi terpilih.");
      if (integer(cells[3] ?? "") !== 12 || integer(cells[6] ?? "") !== 0)
        messages.push("Nilai referensi N harus 12 dan Cuti Bersama harus 0.");
      if (cells.slice(8).some(Boolean))
        messages.push("Kolom tambahan tidak diperbolehkan.");
      try {
        validateOpeningBalanceValues({
          entitlementYear: year,
          n1Days,
          n2Days,
          reason,
        });
      } catch (error) {
        if (!(error instanceof AnnualBalanceAdministrationError)) throw error;
        messages.push(error.message);
      }
      let status: BalanceImportRow["status"] = messages.length
        ? "ERROR"
        : "READY";
      if (employee?.isActive) {
        const readiness = annualBalanceReadiness(
          await this.repository.findAccounts(employee.id, year),
        );
        if (readiness === "PARTIAL") {
          status = "ERROR";
          messages.push(
            "Data saldo tidak lengkap atau tidak konsisten; perlu pemeriksaan manual.",
          );
        } else if (readiness === "INITIALIZED" && !messages.length) {
          status = "SKIP";
          messages.push(
            "Saldo tahun tersebut sudah diinisialisasi; tidak diubah.",
          );
        }
      }
      rows.push({
        rowNumber,
        nip,
        fullName: employee?.fullName ?? cells[1] ?? "",
        entitlementYear: year,
        n1Days: Number.isNaN(n1Days) ? null : n1Days,
        n2Days: Number.isNaN(n2Days) ? null : n2Days,
        reason,
        employeeId: employee?.id ?? null,
        status,
        messages,
      });
    }
    return {
      digest: digest(bytes, year),
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === "READY").length,
      skippedRows: rows.filter((row) => row.status === "SKIP").length,
      errorRows: rows.filter((row) => row.status === "ERROR").length,
      rows,
    };
  }

  async commit(
    input: Readonly<{
      bytes: Uint8Array;
      selectedYear: number;
      batchId: string;
      actorUserId: string;
      previewDigest: string;
      confirmedRows: readonly number[];
    }>,
  ): Promise<BalanceImportResult> {
    if (
      !z.string().uuid().safeParse(input.batchId).success ||
      !z.string().uuid().safeParse(input.actorUserId).success
    )
      throw validation("Identitas batch/Admin tidak valid.");
    requireAnnualBalanceYear(input.selectedYear);
    if (input.previewDigest !== digest(input.bytes, input.selectedYear))
      throw validation("File/tahun berubah. Lakukan preview ulang.");
    if (
      !input.confirmedRows.length ||
      input.confirmedRows.length > MAX_BALANCE_IMPORT_ROWS ||
      input.confirmedRows.some(
        (value) => !Number.isSafeInteger(value) || value < 2,
      ) ||
      new Set(input.confirmedRows).size !== input.confirmedRows.length
    )
      throw validation("Pilih baris valid dari preview sebelum konfirmasi.");
    const preview = await this.preview(input.bytes, input.selectedYear);
    const confirmed = new Set(input.confirmedRows);
    if (
      input.confirmedRows.some(
        (number) => !preview.rows.some((row) => row.rowNumber === number),
      )
    )
      throw validation("Baris konfirmasi tidak ditemukan dalam file.");
    const rows: BalanceImportResultRow[] = [];
    for (const row of preview.rows) {
      if (row.status !== "READY") {
        rows.push({
          ...row,
          status: row.status === "SKIP" ? "SKIP" : "FAILED",
        });
        continue;
      }
      if (!confirmed.has(row.rowNumber)) {
        rows.push({
          ...row,
          status: "SKIP",
          messages: ["Baris tidak dipilih pada konfirmasi preview."],
        });
        continue;
      }
      try {
        await this.administration.initialize({
          employeeId: row.employeeId!,
          entitlementYear: row.entitlementYear,
          n1Days: row.n1Days!,
          n2Days: row.n2Days!,
          reason: row.reason,
          actorUserId: input.actorUserId,
          // The ledger has no actor column: retain authenticated actor + batch correlation in its immutable key.
          idempotencyKey: `batch:${input.batchId}:${input.actorUserId}:${row.employeeId}:${row.entitlementYear}`,
        });
        rows.push({
          ...row,
          status: "SUCCEEDED",
          messages: ["Saldo awal berhasil diinisialisasi."],
        });
      } catch (error) {
        if (error instanceof AnnualBalanceAdministrationError) {
          let skip = error.code === "ALREADY_INITIALIZED";
          if (error.code === "CONCURRENT_CONFLICT") {
            // A key collision alone is not proof of a complete balance set.
            const state = annualBalanceReadiness(
              await this.repository.findAccounts(
                row.employeeId!,
                row.entitlementYear,
              ),
            );
            skip = state === "INITIALIZED";
          }
          rows.push({
            ...row,
            status: skip ? "SKIP" : "FAILED",
            messages: [
              skip
                ? "Saldo sudah diinisialisasi oleh permintaan lain; tidak diubah."
                : error.message,
            ],
          });
        } else {
          rows.push({
            ...row,
            status: "FAILED",
            messages: [
              "Inisialisasi baris gagal. Periksa status saldo lalu coba ulang batch yang sama.",
            ],
          });
        }
      }
    }
    return {
      batchId: input.batchId,
      succeededRows: rows.filter((row) => row.status === "SUCCEEDED").length,
      skippedRows: rows.filter((row) => row.status === "SKIP").length,
      failedRows: rows.filter((row) => row.status === "FAILED").length,
      rows,
    };
  }
}
