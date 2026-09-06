import { LeaveBalancePolicyError } from "./errors";
import { ANNUAL_CARRY_CAP_DAYS, ANNUAL_N_ENTITLEMENT_DAYS } from "./policy";

export type AnnualRolloverInput = Readonly<{
  previousYearNRemaining: number;
  previousYearCommittedAnnualLeaveDays: number;
  twoYearsAgoCommittedAnnualLeaveDays: number;
  currentN2Remaining: number;
  firstQualifyingYear: number;
  secondQualifyingYear: number;
  consumedQualifyingPeriods: readonly string[];
}>;

export type AnnualRollover = Readonly<{
  n: number;
  n1: number;
  n2: number;
  n2GrantedDays: number;
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
 * Finalized policy from docs/m3-balance-decisions.md (BAL-004).
 * It deliberately does not prorate N or cascade old carry-over buckets.
 */
export function calculateAnnualRollover({
  previousYearNRemaining,
  previousYearCommittedAnnualLeaveDays,
  twoYearsAgoCommittedAnnualLeaveDays,
  currentN2Remaining,
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

  requireWholeNonNegativeDays(
    previousYearCommittedAnnualLeaveDays,
    "Pemakaian Cuti Tahunan committed tahun sebelumnya",
  );
  requireWholeNonNegativeDays(
    twoYearsAgoCommittedAnnualLeaveDays,
    "Pemakaian Cuti Tahunan committed dua tahun sebelumnya",
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
  const qualifies =
    previousYearCommittedAnnualLeaveDays === 0 &&
    twoYearsAgoCommittedAnnualLeaveDays === 0 &&
    !consumedQualifyingPeriods.includes(qualifyingPeriodKey);
  const n2GrantedDays = qualifies
    ? ANNUAL_CARRY_CAP_DAYS - currentN2Remaining
    : 0;

  return Object.freeze({
    n: ANNUAL_N_ENTITLEMENT_DAYS,
    n1: Math.min(previousYearNRemaining, ANNUAL_CARRY_CAP_DAYS),
    n2: currentN2Remaining + n2GrantedDays,
    n2GrantedDays,
  });
}
