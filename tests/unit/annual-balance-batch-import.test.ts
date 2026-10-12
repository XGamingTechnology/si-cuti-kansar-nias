import {
  entitlementCapCases,
  withRegularEntitlement,
} from "../support/annual-balance-batch";
import { describe, expect, it } from "vitest";
import {
  AnnualBalanceAdministrationService,
  annualBalanceReadiness,
} from "@/application/leave-balance/administration";
import {
  AnnualBalanceBatchImportService,
  BALANCE_IMPORT_HEADERS,
} from "@/application/leave-balance/batch-import";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import { balanceTemplateWorkbook } from "@/infrastructure/leave-balance/xlsx-balance-template";
import {
  actorUserId,
  batchId,
  BatchTestRepository,
  employeeA,
  employeeB,
  row,
} from "../support/annual-balance-batch";

const workbook = (rows: (string | number)[][]) =>
  balanceTemplateWorkbook([BALANCE_IMPORT_HEADERS, ...rows]);
const build = (repository = new BatchTestRepository()) => ({
  repository,
  service: new AnnualBalanceBatchImportService(
    new XlsxWorkbookReader(true),
    repository,
  ),
});
const initialize = (
  repository: BatchTestRepository,
  employeeId = employeeA.id,
) =>
  new AnnualBalanceAdministrationService(repository).initialize({
    employeeId,
    entitlementYear: 2026,
    n1Days: 2,
    n2Days: 3,
    reason: "Saldo uji",
    idempotencyKey: `initial:${employeeId}`,
    actorUserId,
  });
async function commit(
  service: AnnualBalanceBatchImportService,
  bytes: Uint8Array,
) {
  const preview = await service.preview(bytes, 2026);
  return service.commit({
    bytes,
    selectedYear: 2026,
    batchId,
    actorUserId,
    previewDigest: preview.digest,
    confirmedRows: preview.rows
      .filter((row) => row.status === "READY")
      .map((row) => row.rowNumber),
  });
}

describe("Batch opening balance application", () => {
  it("prefills active employees and text NIP/name without inferring N1/N2", async () => {
    const { repository, service } = build();
    repository.employees.push({
      ...employeeA,
      id: "inactive",
      nip: "INACTIVE",
      isActive: false,
    });
    repository.employees[0] = {
      ...employeeA,
      nip: "001234567890123456789",
      fullName: '=Nama & <Uji> "A"',
    };
    const template = await service.template(2026);
    expect(
      await new XlsxWorkbookReader(true).read(
        balanceTemplateWorkbook(template),
      ),
    ).toEqual([
      [...BALANCE_IMPORT_HEADERS],
      [
        "001234567890123456789",
        '=Nama & <Uji> "A"',
        "2026",
        "12",
        "",
        "",
        "0",
        "",
      ],
      [employeeB.nip, employeeB.fullName, "2026", "12", "", "", "0", ""],
    ]);
    expect(repository.accounts).toHaveLength(0);
  });
  it("previews mixed rows without writing and commits only valid rows", async () => {
    const { repository, service } = build();
    await initialize(repository, employeeB.id);
    const bytes = workbook([
      row(),
      row(employeeB.nip),
      row("MISSING"),
      row(" ", { 4: 7 }),
    ]);
    const before = JSON.stringify(repository);
    const preview = await service.preview(bytes, 2026);
    expect(preview).toMatchObject({
      totalRows: 4,
      validRows: 1,
      skippedRows: 1,
      errorRows: 2,
    });
    expect(JSON.stringify(repository)).toBe(before);
    const result = await commit(service, bytes);
    expect(result).toMatchObject({
      succeededRows: 1,
      skippedRows: 1,
      failedRows: 2,
    });
    expect(await repository.findAccounts(employeeA.id, 2026)).toHaveLength(4);
    expect(
      repository.operations.filter(
        (operation) => operation.employeeId === employeeA.id,
      ),
    ).toEqual([
      expect.objectContaining({
        bucket: "N2",
        days: 3,
        referenceType: "OPENING_BALANCE",
        reason: "Rekap saldo uji resmi",
        idempotencyKey: `batch:${batchId}:${actorUserId}:${employeeA.id}:2026:N2`,
      }),
      expect.objectContaining({ bucket: "N1", days: 2 }),
      expect.objectContaining({ bucket: "N", days: 12 }),
    ]);
  });
  it.each([
    [4, -1],
    [4, 7],
    [5, -1],
    [5, 7],
    [4, 1.5],
    [5, ""],
    [4, "1e0"],
    [3, 13],
    [6, 1],
    [2, 2027],
    [7, ""],
    [7, "x".repeat(1001)],
    [8, "extra"],
  ] as const)("rejects column %s value %s", async (column, value) => {
    const { repository, service } = build();
    const preview = await service.preview(
      workbook([row(employeeA.nip, { [column]: value })]),
      2026,
    );
    expect(preview).toMatchObject({ validRows: 0, errorRows: 1 });
    expect(preview.rows[0].messages.length).toBeGreaterThan(0);
    expect(repository.accounts).toHaveLength(0);
  });
  it("marks every duplicate NIP, including whitespace normalized identities", async () => {
    const { service } = build();
    const preview = await service.preview(
      workbook([row(), row(` ${employeeA.nip} `)]),
      2026,
    );
    expect(preview.errorRows).toBe(2);
    expect(
      preview.rows.every((row) =>
        row.messages.some((message) => message.includes("duplikat")),
      ),
    ).toBe(true);
  });
  it("rejects missing/inactive employees and PARTIAL/invariant sets without repair", async () => {
    const { repository, service } = build();
    repository.employees[1] = { ...employeeB, isActive: false };
    await initialize(repository);
    repository.accounts.pop();
    const before = JSON.stringify(repository);
    const preview = await service.preview(
      workbook([row(), row(employeeB.nip), row("MISSING")]),
      2026,
    );
    expect(preview.errorRows).toBe(3);
    expect(preview.rows[0].messages.join(" ")).toContain("pemeriksaan manual");
    expect(JSON.stringify(repository)).toBe(before);
    const account = repository.accounts[0];
    expect(annualBalanceReadiness([account, account, account, account])).toBe(
      "PARTIAL",
    );
    const validRepository = new BatchTestRepository();
    await initialize(validRepository);
    validRepository.accounts[0] = {
      ...validRepository.accounts[0],
      reservedDays: 99,
    };
    expect(
      (await build(validRepository).service.preview(workbook([row()]), 2026))
        .rows[0].status,
    ).toBe("ERROR");
  });
  it("rejects a bucket-cap violation even when the regular total remains below 24", async () => {
    const repository = new BatchTestRepository();
    await initialize(repository);
    repository.accounts = repository.accounts.map((account) =>
      account.bucket === "N1"
        ? { ...account, grantedDays: 7, availableDays: 7 }
        : account,
    );
    expect(
      (await build(repository).service.preview(workbook([row()]), 2026)).rows[0]
        .status,
    ).toBe("ERROR");
  });

  it("the single initializer also rejects a complete invariant-violating set without mutation", async () => {
    const repository = new BatchTestRepository();
    await initialize(repository);
    repository.accounts[0] = { ...repository.accounts[0], reservedDays: 99 };
    const before = JSON.stringify(repository);
    await expect(initialize(repository)).rejects.toMatchObject({
      code: "PARTIAL_BALANCE",
    });
    expect(JSON.stringify(repository)).toBe(before);
  });

  it.each(entitlementCapCases)(
    "preview and commit reject $label without repairing/overwriting",
    async ({ granted, committed, reserved }) => {
      const { repository, service } = build();
      const bytes = workbook([row()]);
      const validPreview = await service.preview(bytes, 2026);
      await initialize(repository);
      repository.accounts = withRegularEntitlement(
        repository.accounts,
        granted,
        committed,
        reserved,
      );
      const before = JSON.stringify(repository);
      const preview = await service.preview(bytes, 2026);
      expect(preview).toMatchObject({
        validRows: 0,
        skippedRows: 0,
        errorRows: 1,
      });
      expect(preview.rows[0].status).toBe("ERROR");
      expect(preview.rows[0].messages.join(" ")).toContain(
        "pemeriksaan manual",
      );
      expect(
        await service.commit({
          bytes,
          selectedYear: 2026,
          batchId,
          actorUserId,
          previewDigest: validPreview.digest,
          confirmedRows: [2],
        }),
      ).toMatchObject({ succeededRows: 0, skippedRows: 0, failedRows: 1 });
      expect(JSON.stringify(repository)).toBe(before);
    },
  );

  it("does not double grant on the same batch retry or a different batch", async () => {
    const { repository, service } = build();
    const bytes = workbook([row()]);
    const preview = await service.preview(bytes, 2026);
    const input = {
      bytes,
      selectedYear: 2026,
      batchId,
      actorUserId,
      previewDigest: preview.digest,
      confirmedRows: [2],
    };
    expect((await service.commit(input)).succeededRows).toBe(1);
    const before = JSON.stringify(repository);
    expect((await service.commit(input)).skippedRows).toBe(1);
    expect(
      (
        await service.commit({
          ...input,
          batchId: "00000000-0000-4000-8000-000000000097",
        })
      ).skippedRows,
    ).toBe(1);
    expect(JSON.stringify(repository)).toBe(before);
  });
  it("revalidates inactive status at commit and rolls back only failed employee rows", async () => {
    const { repository, service } = build();
    const bytes = workbook([row(), row(employeeB.nip)]);
    repository.failEmployeeId = employeeA.id;
    const result = await commit(service, bytes);
    expect(result).toMatchObject({ succeededRows: 1, failedRows: 1 });
    expect(result.rows[0].messages.join(" ")).not.toContain("private");
    expect(await repository.findAccounts(employeeA.id, 2026)).toHaveLength(0);
    expect(await repository.findAccounts(employeeB.id, 2026)).toHaveLength(4);
    repository.failEmployeeId = null;
    const preview = await service.preview(bytes, 2026);
    repository.employees[0] = { ...employeeA, isActive: false };
    const result2 = await service.commit({
      bytes,
      selectedYear: 2026,
      batchId,
      actorUserId,
      previewDigest: preview.digest,
      confirmedRows: [2],
    });
    expect(result2).toMatchObject({
      succeededRows: 0,
      skippedRows: 1,
      failedRows: 1,
    });
  });
  it("checks status again under the single initializer's lock", async () => {
    const { repository, service } = build();
    const bytes = workbook([row()]);
    repository.afterPreview = () => {
      repository.employees[0] = { ...employeeA, isActive: false };
    };
    const result = await commit(service, bytes);
    expect(result.failedRows).toBe(1);
    expect(repository.accounts).toHaveLength(0);
  });
  it("requires the same file/year and explicit valid-row confirmation", async () => {
    const { repository, service } = build();
    const bytes = workbook([row(), row(employeeB.nip)]);
    const preview = await service.preview(bytes, 2026);
    const input = {
      bytes,
      selectedYear: 2026,
      batchId,
      actorUserId,
      previewDigest: preview.digest,
      confirmedRows: [2],
    };
    await expect(
      service.commit({
        ...input,
        bytes: workbook([row(employeeA.nip, { 4: 6 })]),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      service.commit({ ...input, selectedYear: 2027 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    for (const confirmedRows of [[], [2, 2], [9999], [1], [2.5]])
      await expect(
        service.commit({ ...input, confirmedRows }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await service.commit(input)).toMatchObject({
      succeededRows: 1,
      skippedRows: 1,
    });
    expect(await repository.findAccounts(employeeB.id, 2026)).toHaveLength(0);
  });
  it("rejects wrong headers, empty workbooks, malformed bytes, and row-limit overflow", async () => {
    const { service } = build();
    await expect(
      service.preview(balanceTemplateWorkbook([["Wrong"]]), 2026),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(service.preview(workbook([]), 2026)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      service.preview(new Uint8Array([1, 2]), 2026),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      service.preview(
        workbook(Array.from({ length: 1001 }, (_, i) => row(`MISSING-${i}`))),
        2026,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("ignores fully empty rows and preserves worksheet row numbers", async () => {
    const { service } = build();
    const preview = await service.preview(workbook([[], row()]), 2026);
    expect(preview.rows[0].rowNumber).toBe(3);
    expect(preview.totalRows).toBe(1);
  });
});
