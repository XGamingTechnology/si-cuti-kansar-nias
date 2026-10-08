import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AnnualBalanceAdministrationService } from "@/application/leave-balance/administration";
import {
  AnnualBalanceBatchImportService,
  BALANCE_IMPORT_HEADERS,
} from "@/application/leave-balance/batch-import";
import { AnnualBalanceMutationService } from "@/application/leave-balance/service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaAnnualBalanceAdministrationRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-administration-repository";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import { balanceTemplateWorkbook } from "@/infrastructure/leave-balance/xlsx-balance-template";

const run = process.env.DATABASE_URL ? describe : describe.skip;
run("Batch opening balance PostgreSQL persistence", () => {
  const database = createDatabaseClient();
  const repository = new PrismaAnnualBalanceAdministrationRepository(database);
  const service = new AnnualBalanceBatchImportService(
    new XlsxWorkbookReader(true),
    repository,
  );
  const single = new AnnualBalanceAdministrationService(repository);
  const employeeIds: string[] = [];
  const year = 2096;
  const actorUserId = randomUUID();
  async function employee(isActive = true) {
    const result = await database.employee.create({
      data: {
        nip: `T98-${randomUUID().slice(0, 24)}`,
        fullName: "Pegawai Uji Batch",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
        isActive,
      },
    });
    employeeIds.push(result.id);
    return result;
  }
  const row = (nip: string, n1 = 2, n2 = 3) => [
    nip,
    "Referensi",
    year,
    12,
    n1,
    n2,
    0,
    "Dokumen saldo awal uji",
  ];
  const workbook = (rows: (string | number)[][]) =>
    balanceTemplateWorkbook([BALANCE_IMPORT_HEADERS, ...rows]);
  async function input(bytes: Uint8Array) {
    const preview = await service.preview(bytes, year);
    return {
      bytes,
      selectedYear: year,
      batchId: randomUUID(),
      actorUserId,
      previewDigest: preview.digest,
      confirmedRows: preview.rows
        .filter((row) => row.status === "READY")
        .map((row) => row.rowNumber),
    };
  }
  afterEach(async () => {
    await database.annualBalanceOperation.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.annualBalanceAccount.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.employee.deleteMany({ where: { id: { in: employeeIds } } });
    employeeIds.length = 0;
  });
  afterAll(() => database.$disconnect());
  it("previews mixed rows without writes and retains single initialization, actor, reason and ledger", async () => {
    const a = await employee();
    const initialized = await employee();
    const partial = await employee();
    const inactive = await employee(false);
    await single.initialize({
      employeeId: initialized.id,
      entitlementYear: year,
      n1Days: 0,
      n2Days: 0,
      reason: "Single uji",
      idempotencyKey: randomUUID(),
      actorUserId,
    });
    await database.annualBalanceAccount.create({
      data: {
        employeeId: partial.id,
        entitlementYear: year,
        bucket: "N",
        grantedDays: 12,
      },
    });
    const bytes = workbook([
      row(a.nip),
      row(initialized.nip),
      row(partial.nip),
      row(inactive.nip),
      row("MISSING-98"),
    ]);
    const before = await database.annualBalanceAccount.findMany({
      where: { employeeId: { in: employeeIds } },
      orderBy: { id: "asc" },
    });
    const preview = await service.preview(bytes, year);
    expect(preview).toMatchObject({
      totalRows: 5,
      validRows: 1,
      skippedRows: 1,
      errorRows: 3,
    });
    expect(
      await database.annualBalanceAccount.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    const batch = await input(bytes);
    expect(await service.commit(batch)).toMatchObject({
      succeededRows: 1,
      skippedRows: 1,
      failedRows: 3,
    });
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: a.id, entitlementYear: year },
      }),
    ).toBe(4);
    const grants = await database.annualBalanceOperation.findMany({
      where: { employeeId: a.id },
    });
    expect(grants).toHaveLength(3);
    expect(
      grants.every(
        (operation) =>
          operation.idempotencyKey.startsWith(
            `batch:${batch.batchId}:${actorUserId}:${a.id}:${year}:`,
          ) &&
          operation.reason === "Dokumen saldo awal uji" &&
          operation.referenceType === "OPENING_BALANCE" &&
          operation.referenceId === `opening-balance:${a.id}:${year}`,
      ),
    ).toBe(true);
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: partial.id },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: partial.id },
      }),
    ).toBe(0);
    const reserve = await new AnnualBalanceMutationService(
      new PrismaAnnualBalanceRepository(database),
    ).reserveAnnualLeave({
      employeeId: a.id,
      entitlementYear: year,
      requestedDays: 4,
      reference: { referenceType: "LEAVE_REQUEST", referenceId: randomUUID() },
      idempotencyKey: randomUUID(),
    });
    expect(
      reserve.operations.map((operation) => [operation.bucket, operation.days]),
    ).toEqual([
      ["N2", 3],
      ["N1", 1],
    ]);
  });
  it("serializes concurrent identical batch retries without duplicate grants", async () => {
    const a = await employee();
    const b = await employee();
    const batch = await input(workbook([row(a.nip), row(b.nip)]));
    const results = await Promise.all([
      service.commit(batch),
      service.commit(batch),
    ]);
    expect(results.reduce((sum, result) => sum + result.succeededRows, 0)).toBe(
      2,
    );
    expect(results.reduce((sum, result) => sum + result.skippedRows, 0)).toBe(
      2,
    );
    expect(results.every((result) => result.failedRows === 0)).toBe(true);
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: { in: [a.id, b.id] } },
      }),
    ).toBe(8);
    const operations = await database.annualBalanceOperation.findMany({
      where: { employeeId: { in: [a.id, b.id] } },
      orderBy: { id: "asc" },
    });
    expect(operations).toHaveLength(6);
    expect((await service.commit(batch)).skippedRows).toBe(2);
    expect(
      await database.annualBalanceOperation.findMany({
        where: { employeeId: { in: [a.id, b.id] } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(operations);
  });
  it("revalidates initialization, partial accounts and inactive employees after preview", async () => {
    const a = await employee();
    const b = await employee();
    const c = await employee();
    const batch = await input(workbook([row(a.nip), row(b.nip), row(c.nip)]));
    await single.initialize({
      employeeId: a.id,
      entitlementYear: year,
      n1Days: 6,
      n2Days: 0,
      reason: "Permintaan single menang",
      idempotencyKey: randomUUID(),
      actorUserId,
    });
    await database.annualBalanceAccount.create({
      data: {
        employeeId: b.id,
        entitlementYear: year,
        bucket: "N1",
        grantedDays: 1,
      },
    });
    await database.employee.update({
      where: { id: c.id },
      data: { isActive: false },
    });
    expect(await service.commit(batch)).toMatchObject({
      succeededRows: 0,
      skippedRows: 1,
      failedRows: 2,
    });
    expect((await single.get(a.id, year)).balances.N1?.grantedDays).toBe(6);
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: b.id },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: c.id },
      }),
    ).toBe(0);
  });
  it("rolls back all accounts for a failing employee while allowing another employee to succeed", async () => {
    const a = await employee();
    const b = await employee();
    const batch = await input(workbook([row(a.nip), row(b.nip)]));
    // Force a real unique-key failure in the second positive GRANT after accounts/first GRANT were inserted.
    await database.annualBalanceOperation.create({
      data: {
        employeeId: a.id,
        entitlementYear: year,
        bucket: "N1",
        operationType: "GRANT",
        days: 1,
        occurredAt: new Date(),
        idempotencyKey: `batch:${batch.batchId}:${actorUserId}:${a.id}:${year}:N1`,
        referenceType: "TEST_CONFLICT",
      },
    });
    const result = await service.commit(batch);
    expect(result).toMatchObject({
      succeededRows: 1,
      skippedRows: 0,
      failedRows: 1,
    });
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: a.id },
      }),
    ).toBe(0);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: a.id },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: b.id },
      }),
    ).toBe(4);
  });
  it("blocks duplicate employee/year rows and manipulations with no grants", async () => {
    const a = await employee();
    const b = await employee();
    const invalid = row(b.nip);
    invalid[3] = 99;
    invalid[6] = 9;
    const preview = await service.preview(
      workbook([row(a.nip), row(` ${a.nip} `), invalid]),
      year,
    );
    expect(preview).toMatchObject({ validRows: 0, errorRows: 3 });
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: { in: employeeIds } },
      }),
    ).toBe(0);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: { in: employeeIds } },
      }),
    ).toBe(0);
  });
});
