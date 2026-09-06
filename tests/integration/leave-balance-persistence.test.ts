import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";
import { PrismaLeaveBalanceCatalogRepository } from "@/infrastructure/leave-balance/prisma-leave-balance-catalog-repository";
import { PrismaWorkingCalendarRepository } from "@/infrastructure/leave-balance/prisma-working-calendar-repository";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("M3 Batch 2 leave-balance persistence", () => {
  const database = createDatabaseClient();
  const balances = new PrismaAnnualBalanceRepository(database);
  const calendar = new PrismaWorkingCalendarRepository(database);
  const catalog = new PrismaLeaveBalanceCatalogRepository(database);
  const employeeIds: string[] = [];

  async function createEmployee(): Promise<string> {
    const suffix = randomUUID();
    const employee = await database.employee.create({
      data: {
        nip: `TEST-${suffix}`,
        fullName: "Pegawai Uji M3",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      },
    });
    employeeIds.push(employee.id);
    return employee.id;
  }

  afterEach(async () => {
    await database.annualBalanceOperation.deleteMany({
      where: {
        employeeId: { in: employeeIds },
        compensatesOperationId: { not: null },
      },
    });
    await database.annualBalanceOperation.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.annualRolloverCommit.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.annualBalanceAccount.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.employee.deleteMany({ where: { id: { in: employeeIds } } });
    employeeIds.length = 0;
    await database.workingCalendarException.deleteMany({
      where: { name: { startsWith: "Uji M3" } },
    });
    await database.jointLeaveEvent.deleteMany({
      where: { name: { startsWith: "Uji M3" } },
    });
  });

  afterAll(() => database.$disconnect());

  it("round-trips date-only calendar enums and enforces one exception per date", async () => {
    const date = `2099-01-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}`;
    await calendar.create({
      date,
      type: "INSTITUTION_NON_WORKING",
      name: "Uji M3 kalender",
    });

    const records = await calendar.listForDateRange(date, date);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ date, type: "INSTITUTION_NON_WORKING" });
    await expect(
      calendar.create({
        date,
        type: "PUBLIC_HOLIDAY",
        name: "Uji M3 duplikat",
      }),
    ).rejects.toThrow();
  });

  it("enforces account uniqueness and nonnegative/cap constraints", async () => {
    const employeeId = await createEmployee();
    const account = await balances.createAccount({
      employeeId,
      entitlementYear: 2099,
      bucket: "N",
      grantedDays: 12,
    });
    await expect(
      balances.createAccount({
        employeeId,
        entitlementYear: 2099,
        bucket: "N",
        grantedDays: 12,
      }),
    ).rejects.toThrow();
    await expect(
      database.annualBalanceAccount.update({
        where: { id: account.id },
        data: { reservedDays: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      database.annualBalanceAccount.update({
        where: { id: account.id },
        data: { committedDays: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      balances.createAccount({
        employeeId,
        entitlementYear: 2099,
        bucket: "N1",
        grantedDays: -1,
      }),
    ).rejects.toThrow();
    await expect(
      balances.createAccount({
        employeeId,
        entitlementYear: 2099,
        bucket: "N2",
        grantedDays: 2,
        reservedDays: 1,
        committedDays: 2,
      }),
    ).rejects.toThrow();
  });

  it("uses PostgreSQL whole-integer semantics for balance counters", async () => {
    const employeeId = await createEmployee();
    await expect(
      database.$executeRawUnsafe(
        `INSERT INTO "AnnualBalanceAccount" ("id", "employeeId", "entitlementYear", "bucket", "grantedDays", "reservedDays", "committedDays", "updatedAt") VALUES ($1::uuid, $2::uuid, 2099, 'N', 1.5, 0, 0, NOW())`,
        randomUUID(),
        employeeId,
      ),
    ).rejects.toThrow();
  });

  it("enforces positive ledger days, idempotency, compensation, and append-only repository API", async () => {
    const employeeId = await createEmployee();
    const original = await database.annualBalanceOperation.create({
      data: {
        employeeId,
        entitlementYear: 2099,
        bucket: "N",
        operationType: "GRANT",
        days: 12,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      },
    });
    const compensation = await database.annualBalanceOperation.create({
      data: {
        employeeId,
        entitlementYear: 2099,
        bucket: "N",
        operationType: "REVERSAL",
        days: 1,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
        compensatesOperationId: original.id,
      },
    });
    expect(compensation.compensatesOperationId).toBe(original.id);

    await expect(
      database.annualBalanceOperation.create({
        data: {
          employeeId,
          entitlementYear: 2099,
          bucket: "N",
          operationType: "ADJUSTMENT",
          days: 0,
          occurredAt: new Date(),
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      database.annualBalanceOperation.create({
        data: {
          employeeId,
          entitlementYear: 2099,
          bucket: "N",
          operationType: "GRANT",
          days: 1,
          occurredAt: new Date(),
          idempotencyKey: original.idempotencyKey,
        },
      }),
    ).rejects.toThrow();

    let ledgerApi: unknown;
    await balances.withLockedAccounts(
      employeeId,
      2099,
      ["N"],
      async (transaction) => {
        ledgerApi = transaction;
      },
    );
    expect(ledgerApi).not.toHaveProperty("update");
    expect(ledgerApi).not.toHaveProperty("delete");
  });

  it("restricts deleting an employee with financial history", async () => {
    const employeeId = await createEmployee();
    await database.annualBalanceOperation.create({
      data: {
        employeeId,
        entitlementYear: 2099,
        bucket: "N",
        operationType: "GRANT",
        days: 12,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      },
    });
    await expect(
      database.employee.delete({ where: { id: employeeId } }),
    ).rejects.toThrow();
  });

  it("enforces both rollover idempotency constraints", async () => {
    const firstEmployeeId = await createEmployee();
    const secondEmployeeId = await createEmployee();
    const idempotencyKey = randomUUID();
    await catalog.createRolloverCommit({
      employeeId: firstEmployeeId,
      targetYear: 2099,
      committedAt: new Date(),
      idempotencyKey,
    });
    await expect(
      catalog.createRolloverCommit({
        employeeId: firstEmployeeId,
        targetYear: 2099,
        committedAt: new Date(),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      catalog.createRolloverCommit({
        employeeId: secondEmployeeId,
        targetYear: 2099,
        committedAt: new Date(),
        idempotencyKey,
      }),
    ).rejects.toThrow();
  });

  it("persists valid joint-leave events and rejects invalid claims and ranges", async () => {
    const valid = await catalog.createJointLeaveEvent({
      name: "Uji M3 acara valid",
      startDate: new Date("2099-02-01T00:00:00.000Z"),
      endDate: new Date("2099-02-02T00:00:00.000Z"),
      claimDays: 2,
      sourceReference: "Referensi uji",
    });
    expect(valid).toMatchObject({ claimDays: 2, isActive: true });
    expect(valid.startDate.toISOString().slice(0, 10)).toBe("2099-02-01");
    expect(valid.endDate.toISOString().slice(0, 10)).toBe("2099-02-02");
    await expect(
      catalog.createJointLeaveEvent({
        name: "Uji M3 klaim nol",
        startDate: new Date("2099-03-01T00:00:00.000Z"),
        endDate: new Date("2099-03-01T00:00:00.000Z"),
        claimDays: 0,
      }),
    ).rejects.toThrow();
    await expect(
      catalog.createJointLeaveEvent({
        name: "Uji M3 rentang salah",
        startDate: new Date("2099-04-02T00:00:00.000Z"),
        endDate: new Date("2099-04-01T00:00:00.000Z"),
        claimDays: 1,
      }),
    ).rejects.toThrow();
  });

  it("serializes concurrent account mutations under a row lock", async () => {
    const employeeId = await createEmployee();
    const account = await balances.createAccount({
      employeeId,
      entitlementYear: 2099,
      bucket: "N",
      grantedDays: 2,
    });

    const reserveOne = (idempotencyKey: string, delay: number) =>
      balances.withLockedAccounts(
        employeeId,
        2099,
        ["N"],
        async (transaction) => {
          const locked = transaction.accounts[0];
          if (!locked) throw new Error("Akun saldo tidak ditemukan.");
          await new Promise((resolve) => setTimeout(resolve, delay));
          const reservedDays = locked.reservedDays + 1;
          await transaction.updateCounters({
            accountId: locked.id,
            grantedDays: locked.grantedDays,
            reservedDays,
            committedDays: locked.committedDays,
          });
          await transaction.append({
            employeeId,
            entitlementYear: 2099,
            bucket: "N",
            operationType: "RESERVE",
            days: 1,
            occurredAt: new Date(),
            idempotencyKey,
          });
          return reservedDays;
        },
      );

    const results = await Promise.all([
      reserveOne(randomUUID(), 100),
      reserveOne(randomUUID(), 0),
    ]);
    expect(results.sort()).toEqual([1, 2]);
    const persisted = await database.annualBalanceAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(persisted.reservedDays).toBe(2);
    expect(
      await database.annualBalanceOperation.count({ where: { employeeId } }),
    ).toBe(2);
  });
});
