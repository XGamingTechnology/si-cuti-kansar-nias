import { LeaveBalancePolicyError } from "./errors";
import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
  ANNUAL_REGULAR_BALANCE_CAP_DAYS,
  type AnnualBalanceBuckets,
} from "./policy";

export type AllocateAnnualBalanceInput = Readonly<{
  requestedDays: number;
  available: AnnualBalanceBuckets;
}>;

export type AnnualBalanceAllocation = Readonly<{
  allocations: AnnualBalanceBuckets;
  totalAllocated: number;
}>;

export type RestoreAnnualBalanceInput = Readonly<{
  committedAllocation: AnnualBalanceBuckets;
  restoreDays: number;
}>;

export type OriginalCommitOperation = Readonly<{
  operationId: string;
  bucket: keyof AnnualBalanceBuckets;
  days: number;
}>;

export type ReversalAllocation = Readonly<{
  compensatesOperationId: string;
  bucket: keyof AnnualBalanceBuckets;
  days: number;
}>;

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `${field} harus berupa bilangan bulat non-negatif.`,
    );
  }
}

function validateAvailableBalance(available: AnnualBalanceBuckets): number {
  let totalAvailable = 0;
  for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
    requireNonNegativeInteger(available[bucket], `Saldo ${bucket}`);
    totalAvailable += available[bucket];
  }

  const regularBalance = available.N2 + available.N1 + available.N;
  if (regularBalance > ANNUAL_REGULAR_BALANCE_CAP_DAYS) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Saldo reguler N + N-1 + N-2 tidak boleh melebihi 24 hari.",
    );
  }

  return totalAvailable;
}

/** Reconstructs a known COMMIT in reverse bucket order for compensating REVERSAL rows. */
export function calculateAnnualBalanceRestoration({
  committedAllocation,
  restoreDays,
}: RestoreAnnualBalanceInput): AnnualBalanceAllocation {
  if (!Number.isSafeInteger(restoreDays) || restoreDays <= 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Jumlah hari pemulihan harus berupa bilangan bulat positif.",
    );
  }

  let totalCommitted = 0;
  for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
    requireNonNegativeInteger(committedAllocation[bucket], `Alokasi ${bucket}`);
    totalCommitted += committedAllocation[bucket];
  }
  if (restoreDays > totalCommitted) {
    throw new LeaveBalancePolicyError(
      "EXCESSIVE_RESTORATION",
      "Hari yang dipulihkan tidak boleh melebihi alokasi COMMIT asal.",
    );
  }

  let remaining = restoreDays;
  const allocations: Record<keyof AnnualBalanceBuckets, number> = {
    JOINT_LEAVE_CLAIM: 0,
    N2: 0,
    N1: 0,
    N: 0,
  };
  for (const bucket of [...ANNUAL_BALANCE_BUCKET_PRIORITY].reverse()) {
    allocations[bucket] = Math.min(committedAllocation[bucket], remaining);
    remaining -= allocations[bucket];
  }
  return Object.freeze({
    allocations: Object.freeze(allocations),
    totalAllocated: restoreDays,
  });
}

/** Returns append-only REVERSAL instructions tied to the original COMMIT rows. */
export function calculateRestorationOperations(
  originalCommits: readonly OriginalCommitOperation[],
  restoreDays: number,
): readonly ReversalAllocation[] {
  const committedAllocation: Record<keyof AnnualBalanceBuckets, number> = {
    JOINT_LEAVE_CLAIM: 0,
    N2: 0,
    N1: 0,
    N: 0,
  };
  for (const operation of originalCommits) {
    if (!operation.operationId) {
      throw new LeaveBalancePolicyError(
        "VALIDATION",
        "COMMIT asal harus memiliki ID operasi.",
      );
    }
    requireNonNegativeInteger(
      operation.days,
      `COMMIT ${operation.operationId}`,
    );
    committedAllocation[operation.bucket] += operation.days;
  }
  calculateAnnualBalanceRestoration({ committedAllocation, restoreDays });

  let remaining = restoreDays;
  const reversals: ReversalAllocation[] = [];
  for (const operation of [...originalCommits].reverse()) {
    if (remaining === 0) break;
    const days = Math.min(operation.days, remaining);
    if (days > 0) {
      reversals.push({
        compensatesOperationId: operation.operationId,
        bucket: operation.bucket,
        days,
      });
    }
    remaining -= days;
  }
  return Object.freeze(reversals.map((reversal) => Object.freeze(reversal)));
}

export function allocateAnnualBalance({
  requestedDays,
  available,
}: AllocateAnnualBalanceInput): AnnualBalanceAllocation {
  if (!Number.isSafeInteger(requestedDays) || requestedDays <= 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Jumlah hari yang diminta harus berupa bilangan bulat positif.",
    );
  }

  const totalAvailable = validateAvailableBalance(available);
  if (totalAvailable < requestedDays) {
    throw new LeaveBalancePolicyError(
      "INSUFFICIENT_BALANCE",
      "Saldo Cuti Tahunan yang tersedia tidak mencukupi.",
    );
  }

  let remaining = requestedDays;
  const allocations = {
    JOINT_LEAVE_CLAIM: 0,
    N2: 0,
    N1: 0,
    N: 0,
  };
  for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
    const allocated = Math.min(available[bucket], remaining);
    allocations[bucket] = allocated;
    remaining -= allocated;
  }

  return Object.freeze({
    allocations: Object.freeze(allocations),
    totalAllocated: requestedDays,
  });
}
