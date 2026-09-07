import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  AnnualBalanceMutationService,
  BalanceMutationError,
} from "@/application/leave-balance/service";
import {
  AnnualRolloverService,
} from "@/application/leave-balance/rollover-service";
import { LeaveBalancePolicyError } from "@/domain/leave-balance";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("M3 Batch 3 annual-balance orchestration", () => {
  const database = createDatabaseClient();
  const repository = new PrismaAnnualBalanceRepository(database);
  const mutations = new AnnualBalanceMutationService(repository);
  const rollover = new AnnualRolloverService(repository);
  const employeeIds: string[] = [];

  async function createEmployee(): Promise<string> {
    const employee = await database.employee.create({
      data: {
        nip: `B3-${randomUUID().replaceAll("-", "").slice(0, 29)}`,
        fullName: "Pegawai Uji M3 Batch 3",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      },
    });
    employeeIds.push(employee.id);
    return employee.id;
  }

  async function createYearAccounts(
    employeeId: string,
    entitlementYear: number,
    balances: Readonly<{
      claim?: number;
      n2?: number;
      n1?: number;
      n?: number;
    }> = {},
  ): Promise<void> {
    const rows = [
      ["JOINT_LEAVE_CLAIM", balances.claim ?? 0],
      ["N2", balances.n2 ?? 0],
      ["N1", balances.n1 ?? 0],
      ["N", balances.n ?? 12],
    ] as const;
    for (const [bucket, grantedDays] of rows) {
      await repository.createAccount({
        employeeId,
        entitlementYear,
        bucket,
        grantedDays,
      });
    }
  }

  afterEach(async () => {
    if (employeeIds.length === 0) return;
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
    await database.n2QualifyingPeriod.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.annualBalanceAccount.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.employee.deleteMany({ where: { id: { in: employeeIds } } });
    employeeIds.length = 0;
  });

  afterAll(() => database.$disconnect());

  it("serializes concurrent reserve commands and prevents double-spend", async () => {
    const employeeId = await createEmployee();
    await createYearAccounts(employeeId, 2099, {
      claim: 2,
      n2: 3,
      n1: 4,
      n: 12,
    });

    const reserve = (referenceId: string) =>
      mutations.reserveAnnualLeave({
        employeeId,
        entitlementYear: 2099,
        reference: { referenceType: "LEAVE_REQUEST", referenceId },
        requestedDays: 12,
        idempotencyKey: `reserve-${referenceId}`,
        occurredAt: new Date("2099-06-01T00:00:00.000Z"),
      });

    const results = await Promise.allSettled([
      reserve(`leave-${randomUUID()}`),
      reserve(`leave-${randomUUID()}`),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(LeaveBalancePolicyError);
    }

    const accounts = await database.annualBalanceAccount.findMany({
      where: { employeeId, entitlementYear: 2099 },
    });
    expect(accounts.reduce((sum, row) => sum + row.reservedDays, 0)).toBe(12);
    const reserveOps = await database.annualBalanceOperation.findMany({
      where: { employeeId, entitlementYear: 2099, operationType: "RESERVE" },
    });
    expect(reserveOps.reduce((sum, row) => sum + row.days, 0)).toBe(12);
  });

  it("persists reserve, exact commit, retry idempotency, and compensating reversal", async () => {
    const employeeId = await createEmployee();
    await createYearAccounts(employeeId, 2099, {
      claim: 2,
      n2: 3,
      n1: 4,
      n: 12,
    });
    const reference = {
      referenceType: "LEAVE_REQUEST",
      referenceId: `leave-${randomUUID()}`,
    };

    await mutations.reserveAnnualLeave({
      employeeId,
      entitlementYear: 2099,
      reference,
      requestedDays: 7,
      idempotencyKey: randomUUID(),
      occurredAt: new Date("2099-06-01T00:00:00.000Z"),
    });
    const commitInput = {
      employeeId,
      entitlementYear: 2099,
      reference,
      idempotencyKey: randomUUID(),
      occurredAt: new Date("2099-06-02T00:00:00.000Z"),
    };
    await mutations.commitAnnualLeave(commitInput);
    await mutations.commitAnnualLeave(commitInput);

    const commits = await database.annualBalanceOperation.findMany({
      where: { employeeId, operationType: "COMMIT" },
      orderBy: { createdAt: "asc" },
    });
    expect(commits.map(({ bucket, days }) => [bucket, days])).toEqual([
      ["JOINT_LEAVE_CLAIM", 2],
      ["N2", 3],
      ["N1", 2],
    ]);

    await mutations.reverseCommittedAnnualLeave({
      employeeId,
      entitlementYear: 2099,
      reference,
      restoreDays: 5,
      idempotencyKey: randomUUID(),
      occurredAt: new Date("2099-06-03T00:00:00.000Z"),
      reason: "Uji reversal sah",
    });

    const reversals = await database.annualBalanceOperation.findMany({
      where: { employeeId, operationType: "REVERSAL" },
      orderBy: { createdAt: "asc" },
    });
    expect(reversals.map(({ bucket, days }) => [bucket, days])).toEqual([
      ["N1", 2],
      ["N2", 3],
    ]);
    expect(reversals.every(({ compensatesOperationId }) => compensatesOperationId)).toBe(true);

    const persisted = await database.annualBalanceAccount.findMany({
      where: { employeeId, entitlementYear: 2099 },
    });
    const byBucket = new Map(persisted.map((row) => [row.bucket, row]));
    expect(byBucket.get("JOINT_LEAVE_CLAIM")).toMatchObject({
      reservedDays: 0,
      committedDays: 2,
    });
    expect(byBucket.get("N2")).toMatchObject({
      reservedDays: 0,
      committedDays: 0,
    });
    expect(byBucket.get("N1")).toMatchObject({
      reservedDays: 0,
      committedDays: 0,
    });
  });

  it("commits rollover atomically and consumes a new N2 qualifying pair only once", async () => {
    const employeeId = await createEmployee();
    await createYearAccounts(employeeId, 2097, { n2: 0, n1: 0, n: 12 });
    await createYearAccounts(employeeId, 2098, { n2: 0, n1: 0, n: 12 });

    const commitInput = {
      employeeId,
      targetYear: 2099,
      idempotencyKey: `rollover-${randomUUID()}`,
      committedAt: new Date("2099-01-01T00:00:00.000Z"),
    };
    const first = await rollover.commitAnnualRollover(commitInput);
    const retried = await rollover.commitAnnualRollover(commitInput);

    expect(first.targetYearAccounts.map(({ bucket, grantedDays }) => [bucket, grantedDays])).toEqual([
      ["JOINT_LEAVE_CLAIM", 0],
      ["N2", 6],
      ["N1", 6],
      ["N", 12],
    ]);
    expect(retried.rolloverCommit.id).toBe(first.rolloverCommit.id);
    expect(
      await database.annualRolloverCommit.count({ where: { employeeId, targetYear: 2099 } }),
    ).toBe(1);
    expect(
      await database.n2QualifyingPeriod.count({
        where: {
          employeeId,
          firstZeroUsageYear: 2097,
          secondZeroUsageYear: 2098,
        },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceOperation.count({
        where: {
          employeeId,
          entitlementYear: 2099,
          operationType: "GRANT",
        },
      }),
    ).toBe(3);
  });

  it("carries an unused active N2 without top-up or banking another qualifying period", async () => {
    const employeeId = await createEmployee();
    await createYearAccounts(employeeId, 2097, { n2: 0, n1: 0, n: 12 });
    await createYearAccounts(employeeId, 2098, { n2: 6, n1: 0, n: 12 });

    const result = await rollover.commitAnnualRollover({
      employeeId,
      targetYear: 2099,
      idempotencyKey: `rollover-${randomUUID()}`,
      committedAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    expect(result.preview.calculation).toMatchObject({
      n2: 6,
      n2GrantedDays: 0,
    });
    expect(
      await database.n2QualifyingPeriod.count({ where: { employeeId } }),
    ).toBe(0);
    const n2 = await database.annualBalanceAccount.findUniqueOrThrow({
      where: {
        employeeId_entitlementYear_bucket: {
          employeeId,
          entitlementYear: 2099,
          bucket: "N2",
        },
      },
    });
    expect(n2.grantedDays).toBe(6);
  });

  it("rejects commit after the same reservation was released", async () => {
    const employeeId = await createEmployee();
    await createYearAccounts(employeeId, 2099);
    const reference = {
      referenceType: "LEAVE_REQUEST",
      referenceId: `leave-${randomUUID()}`,
    };
    await mutations.reserveAnnualLeave({
      employeeId,
      entitlementYear: 2099,
      reference,
      requestedDays: 1,
      idempotencyKey: randomUUID(),
    });
    await mutations.releaseAnnualLeaveReservation({
      employeeId,
      entitlementYear: 2099,
      reference,
      idempotencyKey: randomUUID(),
    });

    await expect(
      mutations.commitAnnualLeave({
        employeeId,
        entitlementYear: 2099,
        reference,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<BalanceMutationError>>({ code: "CONFLICT" }),
    );
  });
});
