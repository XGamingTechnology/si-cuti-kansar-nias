import { LeaveBalancePolicyError } from "./errors";
import { ANNUAL_CARRY_CAP_DAYS, ANNUAL_N_ENTITLEMENT_DAYS } from "./policy";

export type ProvisionalAnnualRolloverInput = Readonly<{
  previousYearNRemaining: number;
  previousYearCommittedAnnualLeaveDays: number;
  twoYearsAgoCommittedAnnualLeaveDays: number;
}>;

export type ProvisionalAnnualRollover = Readonly<{
  n: number;
  n1: number;
  n2: number;
}>;

function requireWholeNonNegativeDays(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      `${field} harus berupa bilangan bulat non-negatif.`,
    );
  }
}

/**
 * PROVISIONAL policy from docs/m3-balance-decisions.md (BAL-004).
 * It deliberately does not prorate N or cascade old carry-over buckets.
 */
export function calculateProvisionalAnnualRollover({
  previousYearNRemaining,
  previousYearCommittedAnnualLeaveDays,
  twoYearsAgoCommittedAnnualLeaveDays,
}: ProvisionalAnnualRolloverInput): ProvisionalAnnualRollover {
  requireWholeNonNegativeDays(
    previousYearNRemaining,
    "Sisa Cuti N tahun sebelumnya",
  );
  requireWholeNonNegativeDays(
    previousYearCommittedAnnualLeaveDays,
    "Pemakaian Cuti Tahunan committed tahun sebelumnya",
  );
  requireWholeNonNegativeDays(
    twoYearsAgoCommittedAnnualLeaveDays,
    "Pemakaian Cuti Tahunan committed dua tahun sebelumnya",
  );

  return Object.freeze({
    n: ANNUAL_N_ENTITLEMENT_DAYS,
    n1: Math.min(previousYearNRemaining, ANNUAL_CARRY_CAP_DAYS),
    n2:
      previousYearCommittedAnnualLeaveDays === 0 &&
      twoYearsAgoCommittedAnnualLeaveDays === 0
        ? ANNUAL_CARRY_CAP_DAYS
        : 0,
  });
}
