import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AnnualBalanceAdministrationService } from "@/application/leave-balance/administration";
import { AnnualBalanceMutationService } from "@/application/leave-balance/service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaAnnualBalanceAdministrationRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-administration-repository";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";

const run = process.env.DATABASE_URL ? describe : describe.skip;
run("Admin annual opening balance persistence", () => {
  const database = createDatabaseClient();
  const service = new AnnualBalanceAdministrationService(
    new PrismaAnnualBalanceAdministrationRepository(database),
  );
  const employeeIds: string[] = [];

  async function createEmployee(isActive = true) {
    const employee = await database.employee.create({
      data: {
        nip: `T57-${randomUUID().replaceAll("-", "").slice(0, 26)}`,
        fullName: "Pegawai Uji Saldo",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
        isActive,
      },
    });
    employeeIds.push(employee.id);
    return employee;
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

  it("initializes atomically and existing reservation consumes N", async () => {
    const employee = await createEmployee();
    await service.initialize({
      employeeId: employee.id,
      entitlementYear: 2098,
      n1Days: 0,
      n2Days: 0,
      reason: "Dokumen pembukaan resmi",
      idempotencyKey: randomUUID(),
      actorUserId: randomUUID(),
    });
    const accounts = await database.annualBalanceAccount.findMany({
      where: { employeeId: employee.id, entitlementYear: 2098 },
    });
    expect(accounts).toHaveLength(4);
    expect(
      await database.annualBalanceOperation.findMany({
        where: { employeeId: employee.id },
      }),
    ).toHaveLength(1);
    const reserved = await new AnnualBalanceMutationService(
      new PrismaAnnualBalanceRepository(database),
    ).reserveAnnualLeave({
      employeeId: employee.id,
      entitlementYear: 2098,
      requestedDays: 2,
      reference: { referenceType: "LEAVE_REQUEST", referenceId: randomUUID() },
      idempotencyKey: randomUUID(),
    });
    expect(reserved.operations).toEqual([
      expect.objectContaining({
        bucket: "N",
        days: 2,
        operationType: "RESERVE",
      }),
    ]);
  });

  it("serializes two concurrent attempts into one opening initialization", async () => {
    const employee = await createEmployee();
    const base = {
      employeeId: employee.id,
      entitlementYear: 2099,
      n1Days: 4,
      n2Days: 5,
      reason: "Saldo pembukaan tervalidasi",
      actorUserId: randomUUID(),
    };
    const results = await Promise.allSettled([
      service.initialize({ ...base, idempotencyKey: randomUUID() }),
      service.initialize({ ...base, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: employee.id, entitlementYear: 2099 },
      }),
    ).toBe(4);
    const grants = await database.annualBalanceOperation.findMany({
      where: {
        employeeId: employee.id,
        entitlementYear: 2099,
        operationType: "GRANT",
      },
    });
    expect(grants).toHaveLength(3);
    expect(grants.reduce((sum, item) => sum + item.days, 0)).toBe(21);
  });

  it("leaves a partial pre-existing set unchanged", async () => {
    const employee = await createEmployee();
    await database.annualBalanceAccount.create({
      data: {
        employeeId: employee.id,
        entitlementYear: 2097,
        bucket: "N",
        grantedDays: 12,
      },
    });
    await expect(
      service.initialize({
        employeeId: employee.id,
        entitlementYear: 2097,
        n1Days: 1,
        n2Days: 1,
        reason: "Dasar",
        idempotencyKey: randomUUID(),
        actorUserId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_BALANCE" });
    expect(
      await database.annualBalanceAccount.count({
        where: { employeeId: employee.id, entitlementYear: 2097 },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: employee.id, entitlementYear: 2097 },
      }),
    ).toBe(0);
  });
});
