import { LeaveBalancePolicyError } from "./errors";
import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
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

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `${field} harus berupa bilangan bulat non-negatif.`,
    );
  }
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

  let totalAvailable = 0;
  for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
    requireNonNegativeInteger(available[bucket], `Saldo ${bucket}`);
    totalAvailable += available[bucket];
  }
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
