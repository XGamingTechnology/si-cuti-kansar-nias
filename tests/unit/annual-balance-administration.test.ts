import { describe, expect, it } from "vitest";
import {
  AnnualBalanceAdministrationService,
  type AnnualBalanceAdministrationRepository,
  type AnnualBalanceEmployee,
  type LockedOpeningBalanceTransaction,
} from "@/application/leave-balance/administration";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceOperationRecord,
} from "@/application/leave-balance/ports";

const employee: AnnualBalanceEmployee = {
  id: "employee-1",
  nip: "TEST-57",
  fullName: "Pegawai Uji",
  isActive: true,
};

class FakeRepository implements AnnualBalanceAdministrationRepository {
  employee: AnnualBalanceEmployee | null = employee;
  accounts: AnnualBalanceAccountState[] = [];
  operations: AnnualBalanceOperationRecord[] = [];
  sequence = 0;
  listActiveEmployees() {
    return Promise.resolve(this.employee?.isActive ? [this.employee] : []);
  }
  findEmployee() {
    return Promise.resolve(this.employee);
  }
  findAccounts() {
    return Promise.resolve(this.accounts);
  }
  findHistory() {
    return Promise.resolve(this.operations);
  }
  withLockedEmployee<T>(
    _employeeId: string,
    _year: number,
    work: (transaction: LockedOpeningBalanceTransaction) => Promise<T>,
  ) {
    const transaction: LockedOpeningBalanceTransaction = {
      employee: this.employee,
      accounts: this.accounts,
      createAccount: async (input) => {
        const row = {
          id: `account-${++this.sequence}`,
          ...input,
          reservedDays: 0,
          committedDays: 0,
          availableDays: input.grantedDays,
        };
        this.accounts.push(row);
        return row;
      },
      append: async (input) => {
        const row = {
          id: `operation-${++this.sequence}`,
          ...input,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          compensatesOperationId: input.compensatesOperationId ?? null,
          reason: input.reason ?? null,
        };
        this.operations.push(row);
        return row;
      },
    };
    return work(transaction);
  }
}

const input = {
  employeeId: employee.id,
  entitlementYear: 2026,
  n1Days: 0,
  n2Days: 0,
  reason: "Rekap saldo resmi",
  idempotencyKey: "opening-57",
  actorUserId: "admin-1",
  occurredAt: new Date("2026-01-02T00:00:00Z"),
};

describe("AnnualBalanceAdministrationService", () => {
  it("lists active employees and represents a missing set as uninitialized", async () => {
    const result = await new AnnualBalanceAdministrationService(
      new FakeRepository(),
    ).list(2026);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      employeeId: employee.id,
      readiness: "UNINITIALIZED",
      isInitialized: false,
      regularAvailableDays: 0,
    });
  });

  it("creates all accounts, including zero-day buckets, and grants only positive amounts", async () => {
    const repository = new FakeRepository();
    const result = await new AnnualBalanceAdministrationService(
      repository,
    ).initialize(input);
    expect(result.isInitialized).toBe(true);
    expect(
      repository.accounts.map(({ bucket, grantedDays }) => [
        bucket,
        grantedDays,
      ]),
    ).toEqual([
      ["JOINT_LEAVE_CLAIM", 0],
      ["N2", 0],
      ["N1", 0],
      ["N", 12],
    ]);
    expect(repository.operations).toHaveLength(1);
    expect(repository.operations[0]).toMatchObject({
      bucket: "N",
      operationType: "GRANT",
      days: 12,
      reason: input.reason,
      referenceType: "OPENING_BALANCE",
      referenceId: `opening-balance:${employee.id}:2026`,
      idempotencyKey: "opening-57:N",
    });
  });

  it("preserves positive N1 and N2 and creates one grant for each positive bucket", async () => {
    const repository = new FakeRepository();
    await new AnnualBalanceAdministrationService(repository).initialize({
      ...input,
      n1Days: 5,
      n2Days: 6,
    });
    expect(
      repository.accounts.find(({ bucket }) => bucket === "N1")?.grantedDays,
    ).toBe(5);
    expect(
      repository.accounts.find(({ bucket }) => bucket === "N2")?.grantedDays,
    ).toBe(6);
    expect(
      repository.operations.map(({ bucket, days }) => [bucket, days]),
    ).toEqual([
      ["N2", 6],
      ["N1", 5],
      ["N", 12],
    ]);
  });

  it.each([
    ["n1Days", -1],
    ["n1Days", 7],
    ["n2Days", -1],
    ["n2Days", 7],
    ["n1Days", 1.5],
    ["n2Days", 2.5],
  ] as const)("rejects invalid %s value %s", async (field, value) => {
    await expect(
      new AnnualBalanceAdministrationService(new FakeRepository()).initialize({
        ...input,
        [field]: value,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects an empty reason", async () => {
    await expect(
      new AnnualBalanceAdministrationService(new FakeRepository()).initialize({
        ...input,
        reason: "  ",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects missing and inactive employees safely", async () => {
    const missing = new FakeRepository();
    missing.employee = null;
    await expect(
      new AnnualBalanceAdministrationService(missing).initialize(input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const inactive = new FakeRepository();
    inactive.employee = { ...employee, isActive: false };
    await expect(
      new AnnualBalanceAdministrationService(inactive).initialize(input),
    ).rejects.toMatchObject({ code: "INACTIVE_EMPLOYEE" });
  });

  it("rejects a second initialization without adding rows", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceAdministrationService(repository);
    await service.initialize(input);
    await expect(
      service.initialize({ ...input, idempotencyKey: "second" }),
    ).rejects.toMatchObject({ code: "ALREADY_INITIALIZED" });
    expect(repository.accounts).toHaveLength(4);
    expect(repository.operations).toHaveLength(1);
  });

  it("rejects a partial set without changing it", async () => {
    const repository = new FakeRepository();
    repository.accounts.push({
      id: "partial",
      employeeId: employee.id,
      entitlementYear: 2026,
      bucket: "N",
      grantedDays: 12,
      reservedDays: 0,
      committedDays: 0,
      availableDays: 12,
    });
    await expect(
      new AnnualBalanceAdministrationService(repository).initialize(input),
    ).rejects.toMatchObject({ code: "PARTIAL_BALANCE" });
    expect(repository.accounts).toHaveLength(1);
    expect(repository.operations).toHaveLength(0);
  });
});
