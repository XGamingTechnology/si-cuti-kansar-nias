import { describe, expect, it } from "vitest";
import {
  AnnualRolloverError,
  AnnualRolloverService,
} from "@/application/leave-balance/rollover-service";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceOperationRecord,
  AnnualRolloverCommitState,
  AnnualRolloverRepository,
  AnnualRolloverSnapshot,
  AppendBalanceOperation,
  LockedAnnualRolloverTransaction,
  N2QualifyingPeriodState,
} from "@/application/leave-balance/ports";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";

function account(
  entitlementYear: number,
  bucket: AnnualBalanceBucket,
  grantedDays: number,
  committedDays = 0,
  reservedDays = 0,
): AnnualBalanceAccountState {
  return {
    id: `account-${entitlementYear}-${bucket}`,
    employeeId: "employee-1",
    entitlementYear,
    bucket,
    grantedDays,
    committedDays,
    reservedDays,
    availableDays: grantedDays - committedDays - reservedDays,
  };
}

function operation(
  id: string,
  entitlementYear: number,
  bucket: AnnualBalanceBucket,
  operationType: "COMMIT" | "REVERSAL",
  days: number,
  compensatesOperationId: string | null = null,
): AnnualBalanceOperationRecord {
  return {
    id,
    employeeId: "employee-1",
    entitlementYear,
    bucket,
    operationType,
    days,
    occurredAt: new Date(`${entitlementYear}-06-01T00:00:00.000Z`),
    idempotencyKey: `${id}-key`,
    referenceType: "LEAVE_REQUEST",
    referenceId: `leave-${id}`,
    compensatesOperationId,
    reason: null,
  };
}

function baseSnapshot(): AnnualRolloverSnapshot {
  return {
    employeeId: "employee-1",
    targetYear: 2026,
    previousYearAccounts: [
      account(2025, "JOINT_LEAVE_CLAIM", 0),
      account(2025, "N2", 0),
      account(2025, "N1", 0),
      account(2025, "N", 12),
    ],
    twoYearsAgoAccounts: [
      account(2024, "JOINT_LEAVE_CLAIM", 0),
      account(2024, "N2", 0),
      account(2024, "N1", 0),
      account(2024, "N", 12),
    ],
    previousYearOperations: [],
    twoYearsAgoOperations: [],
    consumedQualifyingPeriods: [],
    existingRolloverCommit: null,
    targetYearAccounts: [],
  };
}

class FakeRolloverRepository implements AnnualRolloverRepository {
  snapshot = baseSnapshot();
  readonly createdOperations: AnnualBalanceOperationRecord[] = [];
  readonly qualifyingPeriods: N2QualifyingPeriodState[] = [];
  private sequence = 0;

  getRolloverSnapshot(): Promise<AnnualRolloverSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  withLockedRollover<T>(
    _employeeId: string,
    _targetYear: number,
    work: (transaction: LockedAnnualRolloverTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction: LockedAnnualRolloverTransaction = {
      snapshot: this.snapshot,
      createAccount: async (input) => {
        const created = account(
          input.entitlementYear,
          input.bucket,
          input.grantedDays,
        );
        this.snapshot = {
          ...this.snapshot,
          targetYearAccounts: [...this.snapshot.targetYearAccounts, created],
        };
        return created;
      },
      append: async (input: AppendBalanceOperation) => {
        const created: AnnualBalanceOperationRecord = {
          id: `operation-${++this.sequence}`,
          ...input,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          compensatesOperationId: input.compensatesOperationId ?? null,
          reason: input.reason ?? null,
        };
        this.createdOperations.push(created);
        return created;
      },
      createN2QualifyingPeriod: async (input) => {
        const created = { ...input };
        this.qualifyingPeriods.push(created);
        return created;
      },
      createRolloverCommit: async (input) => {
        const created: AnnualRolloverCommitState = {
          id: "rollover-commit-1",
          ...input,
        };
        this.snapshot = {
          ...this.snapshot,
          existingRolloverCommit: created,
        };
        return created;
      },
    };
    return work(transaction);
  }
}

const input = { employeeId: "employee-1", targetYear: 2026 };

describe("AnnualRolloverService", () => {
  it("previews N, N1 and a new N2 from two zero-effective-usage years", async () => {
    const repository = new FakeRolloverRepository();
    const service = new AnnualRolloverService(repository);

    const preview = await service.previewAnnualRollover(input);

    expect(preview.calculation).toMatchObject({
      n: 12,
      n1: 6,
      n2: 6,
      n2GrantedDays: 6,
      n2ExpiredDays: 0,
    });
    expect(preview.qualifyingPeriodKey).toBe("2024:2025");
    expect(preview.alreadyCommitted).toBe(false);
  });

  it("treats a fully reversed annual leave commit as zero usage for qualification", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      previousYearOperations: [
        operation("commit-1", 2025, "N", "COMMIT", 4),
        operation("reversal-1", 2025, "N", "REVERSAL", 4, "commit-1"),
      ],
    };
    const service = new AnnualRolloverService(repository);

    const preview = await service.previewAnnualRollover(input);

    expect(preview.previousYearEffectiveAnnualLeaveUsageDays).toBe(0);
    expect(preview.calculation.n2GrantedDays).toBe(6);
  });

  it("treats a fully reversed N2 commit as unused and carries the entitlement", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      previousYearAccounts: [
        account(2025, "JOINT_LEAVE_CLAIM", 0),
        account(2025, "N2", 6),
        account(2025, "N1", 0),
        account(2025, "N", 12),
      ],
      previousYearOperations: [
        operation("commit-n2", 2025, "N2", "COMMIT", 2),
        operation("reverse-n2", 2025, "N2", "REVERSAL", 2, "commit-n2"),
      ],
    };
    const service = new AnnualRolloverService(repository);

    const preview = await service.previewAnnualRollover(input);

    expect(preview.currentN2WasUsed).toBe(false);
    expect(preview.calculation).toMatchObject({
      n2: 6,
      n2GrantedDays: 0,
      n2ExpiredDays: 0,
    });
  });

  it("carries active unused N2 without topping up or consuming a new qualifying pair", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      previousYearAccounts: [
        account(2025, "JOINT_LEAVE_CLAIM", 0),
        account(2025, "N2", 6),
        account(2025, "N1", 0),
        account(2025, "N", 12),
      ],
    };
    const service = new AnnualRolloverService(repository);

    const result = await service.commitAnnualRollover({
      ...input,
      idempotencyKey: "rollover-carry-n2-2026",
      committedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.preview.calculation).toMatchObject({
      n2: 6,
      n2GrantedDays: 0,
    });
    expect(repository.qualifyingPeriods).toHaveLength(0);
    expect(
      result.targetYearAccounts.find(({ bucket }) => bucket === "N2")?.grantedDays,
    ).toBe(6);
  });

  it("expires remaining N2 at rollover after partial effective N2 use", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      previousYearAccounts: [
        account(2025, "JOINT_LEAVE_CLAIM", 0),
        account(2025, "N2", 6, 2),
        account(2025, "N1", 0),
        account(2025, "N", 12),
      ],
      previousYearOperations: [
        operation("commit-n2", 2025, "N2", "COMMIT", 2),
      ],
    };
    const service = new AnnualRolloverService(repository);

    const preview = await service.previewAnnualRollover(input);

    expect(preview.currentN2WasUsed).toBe(true);
    expect(preview.calculation).toMatchObject({
      n2: 0,
      n2GrantedDays: 0,
      n2ExpiredDays: 4,
    });
  });

  it("commits four target accounts, grant ledger rows and the consumed N2 pair", async () => {
    const repository = new FakeRolloverRepository();
    const service = new AnnualRolloverService(repository);

    const result = await service.commitAnnualRollover({
      ...input,
      idempotencyKey: "rollover-employee-1-2026",
      committedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.targetYearAccounts).toHaveLength(4);
    expect(
      result.targetYearAccounts.map(({ bucket, grantedDays }) => [bucket, grantedDays]),
    ).toEqual([
      ["JOINT_LEAVE_CLAIM", 0],
      ["N2", 6],
      ["N1", 6],
      ["N", 12],
    ]);
    expect(result.operations.map(({ bucket, days }) => [bucket, days])).toEqual([
      ["N2", 6],
      ["N1", 6],
      ["N", 12],
    ]);
    expect(repository.qualifyingPeriods).toHaveLength(1);
    expect(result.preview.alreadyCommitted).toBe(true);
  });

  it("returns the existing committed rollover without creating duplicate grants", async () => {
    const repository = new FakeRolloverRepository();
    const service = new AnnualRolloverService(repository);
    const commitInput = {
      ...input,
      idempotencyKey: "rollover-employee-1-2026",
    };

    await service.commitAnnualRollover(commitInput);
    const firstOperationCount = repository.createdOperations.length;
    const retried = await service.commitAnnualRollover(commitInput);

    expect(retried.rolloverCommit.id).toBe("rollover-commit-1");
    expect(repository.createdOperations).toHaveLength(firstOperationCount);
  });

  it("blocks rollover while a previous-year reservation remains outstanding", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      previousYearAccounts: repository.snapshot.previousYearAccounts.map(
        (item) =>
          item.bucket === "N"
            ? account(2025, "N", 12, 0, 1)
            : item,
      ),
    };
    const service = new AnnualRolloverService(repository);

    await expect(service.previewAnnualRollover(input)).rejects.toThrowError(
      expect.objectContaining<Partial<AnnualRolloverError>>({ code: "CONFLICT" }),
    );
  });

  it("blocks a first commit when target-year accounts already exist without rollover commit", async () => {
    const repository = new FakeRolloverRepository();
    repository.snapshot = {
      ...repository.snapshot,
      targetYearAccounts: [account(2026, "N", 12)],
    };
    const service = new AnnualRolloverService(repository);

    await expect(
      service.commitAnnualRollover({
        ...input,
        idempotencyKey: "rollover-employee-1-2026",
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<AnnualRolloverError>>({ code: "CONFLICT" }),
    );
  });
});
