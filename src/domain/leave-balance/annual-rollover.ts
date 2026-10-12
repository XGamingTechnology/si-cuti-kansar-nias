import { LeaveBalancePolicyError } from "./errors";
import { ANNUAL_CARRY_CAP_DAYS, ANNUAL_N_ENTITLEMENT_DAYS } from "./policy";

export type AnnualRolloverInput = Readonly<{
  previousYearNRemaining: number;
  previousYearCommittedAnnualLeaveDays: number;
  twoYearsAgoCommittedAnnualLeaveDays: number;
  currentN2Remaining: number;
  currentN2WasUsed: boolean;
  firstQualifyingYear: number;
  secondQualifyingYear: number;
  consumedQualifyingPeriods: readonly string[];
}>;

export type AnnualRollover = Readonly<{
  n: number;
  n1: number;
  n2: number;
  n2GrantedDays: number;
  n2ExpiredDays: number;
}>;

export type EffectiveCommittedUsageInput = Readonly<{
  committedDays: number;
  reversedDays: number;
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
 * Locked Rule Alignment 2.2 interpretation: effective annual-leave usage is
 * committed days minus authorized compensating reversals. Full reversal returns
 * a year to zero-usage status without deleting ledger history.
 */
export function deriveNetAnnualLeaveUsageDays({
  committedDays,
  reversedDays,
}: EffectiveCommittedUsageInput): number {
  requireWholeNonNegativeDays(committedDays, "COMMIT Cuti Tahunan");
  requireWholeNonNegativeDays(reversedDays, "REVERSAL Cuti Tahunan");
  if (reversedDays > committedDays) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "REVERSAL Cuti Tahunan tidak boleh melebihi COMMIT Cuti Tahunan.",
    );
  }
  return committedDays - reversedDays;
}

/**
 * Locked Rule Alignment 2.2 interpretation: N2 counts as used only while its
 * net effective committed usage remains positive after compensating reversals.
 */
export function deriveN2WasUsed(input: EffectiveCommittedUsageInput): boolean {
  return deriveNetAnnualLeaveUsageDays(input) > 0;
}

/**
 * Rule Alignment 2.2 from docs/m3-balance-decisions.md (BAL-004).
 * N2 is one active entitlement capped at six days. An entitlement that has never
 * been used carries forward without top-up. Once it has been used, any remainder
 * expires at the next year boundary and a future entitlement requires a new
 * qualifying two-year period.
 */
export function calculateAnnualRollover({
  previousYearNRemaining,
  previousYearCommittedAnnualLeaveDays,
  twoYearsAgoCommittedAnnualLeaveDays,
  currentN2Remaining,
  currentN2WasUsed,
  firstQualifyingYear,
  secondQualifyingYear,
  consumedQualifyingPeriods,
}: AnnualRolloverInput): AnnualRollover {
  requireWholeNonNegativeDays(
    previousYearNRemaining,
    "Sisa Cuti N tahun sebelumnya",
  );
  requireWholeNonNegativeDays(currentN2Remaining, "Sisa Cuti N-2");
  if (currentN2Remaining > ANNUAL_CARRY_CAP_DAYS) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Saldo Cuti N-2 tidak boleh melebihi 6 hari.",
    );
  }
  if (typeof currentN2WasUsed !== "boolean") {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Status pemakaian Cuti N-2 harus berupa boolean.",
    );
  }

  requireWholeNonNegativeDays(
    previousYearCommittedAnnualLeaveDays,
    "Pemakaian efektif Cuti Tahunan tahun sebelumnya",
  );
  requireWholeNonNegativeDays(
    twoYearsAgoCommittedAnnualLeaveDays,
    "Pemakaian efektif Cuti Tahunan dua tahun sebelumnya",
  );
  if (
    !Number.isSafeInteger(firstQualifyingYear) ||
    secondQualifyingYear !== firstQualifyingYear + 1
  ) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Periode kualifikasi N-2 harus dua tahun kalender berturut-turut.",
    );
  }

  const qualifyingPeriodKey = `${firstQualifyingYear}:${secondQualifyingYear}`;
  const n2ExpiredDays = currentN2WasUsed ? currentN2Remaining : 0;
  const carriedN2Days = currentN2WasUsed ? 0 : currentN2Remaining;
  const hasActiveUnusedN2 = carriedN2Days > 0;
  const qualifiesForNewN2 =
    !hasActiveUnusedN2 &&
    previousYearCommittedAnnualLeaveDays === 0 &&
    twoYearsAgoCommittedAnnualLeaveDays === 0 &&
    !consumedQualifyingPeriods.includes(qualifyingPeriodKey);
  const n2GrantedDays = qualifiesForNewN2 ? ANNUAL_CARRY_CAP_DAYS : 0;

  return Object.freeze({
    n: ANNUAL_N_ENTITLEMENT_DAYS,
    n1: Math.min(previousYearNRemaining, ANNUAL_CARRY_CAP_DAYS),
    n2: carriedN2Days + n2GrantedDays,
    n2GrantedDays,
    n2ExpiredDays,
  });
}
