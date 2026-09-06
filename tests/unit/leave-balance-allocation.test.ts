import { describe, expect, it } from "vitest";
import {
  allocateAnnualBalance,
  LeaveBalancePolicyError,
  type AnnualBalanceBuckets,
} from "@/domain/leave-balance";

const available = (values: Partial<AnnualBalanceBuckets> = {}) => ({
  JOINT_LEAVE_CLAIM: 2,
  N2: 3,
  N1: 4,
  N: 12,
  ...values,
});

describe("allocateAnnualBalance", () => {
  it("allocates four days from Joint Leave Claim before N2", () => {
    expect(
      allocateAnnualBalance({ requestedDays: 4, available: available() }),
    ).toEqual({
      allocations: { JOINT_LEAVE_CLAIM: 2, N2: 2, N1: 0, N: 0 },
      totalAllocated: 4,
    });
  });

  it("allocates seven days across the first three priority buckets", () => {
    expect(
      allocateAnnualBalance({ requestedDays: 7, available: available() }),
    ).toEqual({
      allocations: { JOINT_LEAVE_CLAIM: 2, N2: 3, N1: 2, N: 0 },
      totalAllocated: 7,
    });
  });

  it("allocates a request exactly equal to all available balance", () => {
    const balances = available({ JOINT_LEAVE_CLAIM: 1, N2: 1, N1: 1, N: 1 });
    expect(
      allocateAnnualBalance({ requestedDays: 4, available: balances }),
    ).toEqual({
      allocations: { JOINT_LEAVE_CLAIM: 1, N2: 1, N1: 1, N: 1 },
      totalAllocated: 4,
    });
  });

  it("allocates from N when it is the only available bucket", () => {
    expect(
      allocateAnnualBalance({
        requestedDays: 3,
        available: available({ JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 0, N: 3 }),
      }),
    ).toEqual({
      allocations: { JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 0, N: 3 },
      totalAllocated: 3,
    });
  });

  it.each([0, -1, 1.5])("rejects requested days %s", (requestedDays) => {
    expect(() =>
      allocateAnnualBalance({ requestedDays, available: available() }),
    ).toThrowError(LeaveBalancePolicyError);
  });

  it("rejects a negative bucket balance", () => {
    expect(() =>
      allocateAnnualBalance({
        requestedDays: 1,
        available: available({ N2: -1 }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LeaveBalancePolicyError>>({
        code: "VALIDATION",
      }),
    );
  });

  it("rejects insufficient balance without mutating the input", () => {
    const balances = available({ JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 0, N: 2 });
    const snapshot = { ...balances };

    expect(() =>
      allocateAnnualBalance({ requestedDays: 3, available: balances }),
    ).toThrowError(
      expect.objectContaining<Partial<LeaveBalancePolicyError>>({
        code: "INSUFFICIENT_BALANCE",
      }),
    );
    expect(balances).toEqual(snapshot);
  });

  it("does not mutate bucket balances during successful allocation", () => {
    const balances = available();
    const snapshot = { ...balances };
    allocateAnnualBalance({ requestedDays: 4, available: balances });
    expect(balances).toEqual(snapshot);
  });
});

describe("calculateAnnualBalanceRestoration", () => {
  it("restores the authoritative sample in reverse original-allocation order", async () => {
    const { calculateAnnualBalanceRestoration } =
      await import("@/domain/leave-balance");
    const committed = { JOINT_LEAVE_CLAIM: 2, N2: 0, N1: 3, N: 2 } as const;
    expect(
      calculateAnnualBalanceRestoration({
        committedAllocation: committed,
        restoreDays: 5,
      }),
    ).toEqual({
      allocations: { JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 3, N: 2 },
      totalAllocated: 5,
    });
  });

  it("ties reverse-order restoration to original COMMIT operation IDs", async () => {
    const { calculateRestorationOperations } = await import("@/domain/leave-balance");
    const commits = [
      { operationId: "commit-joint", bucket: "JOINT_LEAVE_CLAIM" as const, days: 2 },
      { operationId: "commit-n1", bucket: "N1" as const, days: 3 },
      { operationId: "commit-n", bucket: "N" as const, days: 2 },
    ];
    expect(calculateRestorationOperations(commits, 5)).toEqual([
      { compensatesOperationId: "commit-n", bucket: "N", days: 2 },
      { compensatesOperationId: "commit-n1", bucket: "N1", days: 3 },
    ]);
  });

  it("supports partial restoration and does not mutate its input", async () => {
    const { calculateAnnualBalanceRestoration } =
      await import("@/domain/leave-balance");
    const committed = { JOINT_LEAVE_CLAIM: 2, N2: 1, N1: 3, N: 2 };
    const snapshot = { ...committed };
    expect(
      calculateAnnualBalanceRestoration({
        committedAllocation: committed,
        restoreDays: 3,
      }).allocations,
    ).toEqual({ JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 1, N: 2 });
    expect(committed).toEqual(snapshot);
  });

  it("cannot restore more than the original COMMIT", async () => {
    const { calculateAnnualBalanceRestoration } =
      await import("@/domain/leave-balance");
    expect(() =>
      calculateAnnualBalanceRestoration({
        committedAllocation: { JOINT_LEAVE_CLAIM: 0, N2: 0, N1: 1, N: 2 },
        restoreDays: 4,
      }),
    ).toThrowError(expect.objectContaining({ code: "EXCESSIVE_RESTORATION" }));
  });
});
