import { describe, expect, it } from "vitest";
import {
  AnnualBalanceMutationService,
  BalanceMutationError,
} from "@/application/leave-balance/service";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceMutationRepository,
  AnnualBalanceOperationRecord,
  AppendBalanceOperation,
  BalanceCounterUpdate,
  LockedAnnualBalanceTransaction,
} from "@/application/leave-balance/ports";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";

function account(
  bucket: AnnualBalanceBucket,
  grantedDays: number,
): AnnualBalanceAccountState {
  return {
    id: `account-${bucket}`,
    employeeId: "employee-1",
    entitlementYear: 2026,
    bucket,
    grantedDays,
    reservedDays: 0,
    committedDays: 0,
    availableDays: grantedDays,
  };
}

class FakeRepository implements AnnualBalanceMutationRepository {
  readonly operations: AnnualBalanceOperationRecord[] = [];
  private sequence = 0;
  readonly accounts = new Map<AnnualBalanceBucket, AnnualBalanceAccountState>([
    ["JOINT_LEAVE_CLAIM", account("JOINT_LEAVE_CLAIM", 2)],
    ["N2", account("N2", 3)],
    ["N1", account("N1", 4)],
    ["N", account("N", 12)],
  ]);

  withLockedAccounts<T>(
    _employeeId: string,
    _entitlementYear: number,
    buckets: readonly AnnualBalanceBucket[],
    work: (transaction: LockedAnnualBalanceTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction: LockedAnnualBalanceTransaction = {
      accounts: buckets.map((bucket) => this.accounts.get(bucket)!),
      updateCounters: async (input: BalanceCounterUpdate) => {
        const current = [...this.accounts.values()].find(({ id }) => id === input.accountId)!;
        const updated: AnnualBalanceAccountState = {
          ...current,
          grantedDays: input.grantedDays,
          reservedDays: input.reservedDays,
          committedDays: input.committedDays,
          availableDays:
            input.grantedDays - input.reservedDays - input.committedDays,
        };
        this.accounts.set(updated.bucket, updated);
        return updated;
      },
      append: async (input: AppendBalanceOperation) => {
        if (this.operations.some(({ idempotencyKey }) => idempotencyKey === input.idempotencyKey)) {
          throw new Error("duplicate idempotency key");
        }
        const operation: AnnualBalanceOperationRecord = {
          id: `operation-${++this.sequence}`,
          ...input,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          compensatesOperationId: input.compensatesOperationId ?? null,
          reason: input.reason ?? null,
        };
        this.operations.push(operation);
        return operation;
      },
      findOperationsByReference: async (referenceType, referenceId) =>
        this.operations.filter(
          (operation) =>
            operation.referenceType === referenceType &&
            operation.referenceId === referenceId,
        ),
      findReversalsForOperationIds: async (operationIds) =>
        this.operations.filter(
          (operation) =>
            operation.operationType === "REVERSAL" &&
            operation.compensatesOperationId !== null &&
            operationIds.includes(operation.compensatesOperationId),
        ),
    };
    return work(transaction);
  }
}

const baseInput = {
  employeeId: "employee-1",
  entitlementYear: 2026,
  reference: { referenceType: "LEAVE_REQUEST", referenceId: "leave-1" },
  occurredAt: new Date("2026-09-07T00:00:00.000Z"),
};

describe("AnnualBalanceMutationService", () => {
  it("reserves atomically in Claim → N2 → N1 → N priority", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);

    const result = await service.reserveAnnualLeave({
      ...baseInput,
      requestedDays: 7,
      idempotencyKey: "reserve-leave-1",
    });

    expect(result.operations.map(({ bucket, days }) => [bucket, days])).toEqual([
      ["JOINT_LEAVE_CLAIM", 2],
      ["N2", 3],
      ["N1", 2],
    ]);
    expect(repository.accounts.get("JOINT_LEAVE_CLAIM")?.reservedDays).toBe(2);
    expect(repository.accounts.get("N2")?.reservedDays).toBe(3);
    expect(repository.accounts.get("N1")?.reservedDays).toBe(2);
    expect(repository.accounts.get("N")?.reservedDays).toBe(0);
  });

  it("returns the same reservation instead of spending twice on retry", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);
    const input = {
      ...baseInput,
      requestedDays: 4,
      idempotencyKey: "reserve-leave-1",
    };

    await service.reserveAnnualLeave(input);
    await service.reserveAnnualLeave(input);

    expect(repository.operations.filter(({ operationType }) => operationType === "RESERVE")).toHaveLength(2);
    expect(repository.accounts.get("JOINT_LEAVE_CLAIM")?.reservedDays).toBe(2);
    expect(repository.accounts.get("N2")?.reservedDays).toBe(2);
  });

  it("commits the exact reservation and clears reserved counters", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);
    await service.reserveAnnualLeave({
      ...baseInput,
      requestedDays: 4,
      idempotencyKey: "reserve-leave-1",
    });

    await service.commitAnnualLeave({
      ...baseInput,
      idempotencyKey: "commit-leave-1",
    });

    expect(repository.accounts.get("JOINT_LEAVE_CLAIM")).toMatchObject({
      reservedDays: 0,
      committedDays: 2,
    });
    expect(repository.accounts.get("N2")).toMatchObject({
      reservedDays: 0,
      committedDays: 2,
    });
  });

  it("releases the exact reservation without committing it", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);
    await service.reserveAnnualLeave({
      ...baseInput,
      requestedDays: 4,
      idempotencyKey: "reserve-leave-1",
    });

    await service.releaseAnnualLeaveReservation({
      ...baseInput,
      idempotencyKey: "release-leave-1",
    });

    expect(repository.accounts.get("JOINT_LEAVE_CLAIM")).toMatchObject({
      reservedDays: 0,
      committedDays: 0,
    });
    expect(repository.accounts.get("N2")).toMatchObject({
      reservedDays: 0,
      committedDays: 0,
    });
  });

  it("prevents committing a reservation that was already released", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);
    await service.reserveAnnualLeave({
      ...baseInput,
      requestedDays: 1,
      idempotencyKey: "reserve-leave-1",
    });
    await service.releaseAnnualLeaveReservation({
      ...baseInput,
      idempotencyKey: "release-leave-1",
    });

    await expect(
      service.commitAnnualLeave({
        ...baseInput,
        idempotencyKey: "commit-leave-1",
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<BalanceMutationError>>({ code: "CONFLICT" }),
    );
  });

  it("reverses unused committed days in reverse original COMMIT order", async () => {
    const repository = new FakeRepository();
    const service = new AnnualBalanceMutationService(repository);
    await service.reserveAnnualLeave({
      ...baseInput,
      requestedDays: 7,
      idempotencyKey: "reserve-leave-1",
    });
    await service.commitAnnualLeave({
      ...baseInput,
      idempotencyKey: "commit-leave-1",
    });

    const result = await service.reverseCommittedAnnualLeave({
      ...baseInput,
      restoreDays: 5,
      idempotencyKey: "reverse-leave-1",
    });

    expect(result.operations.map(({ bucket, days }) => [bucket, days])).toEqual([
      ["N1", 2],
      ["N2", 3],
    ]);
    expect(repository.accounts.get("N1")?.committedDays).toBe(0);
    expect(repository.accounts.get("N2")?.committedDays).toBe(0);
    expect(repository.accounts.get("JOINT_LEAVE_CLAIM")?.committedDays).toBe(2);
  });
});
