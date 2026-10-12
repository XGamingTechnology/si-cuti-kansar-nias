import { LeaveBalancePolicyError } from "./errors";

export type JointLeavePolicyInput = Readonly<{
  applicableYear: number;
  eventDates: readonly string[];
  quotaDays: number;
  claimOpensAt: Date;
  claimDeadlineAt: Date;
  creditYear: number;
}>;

/** Validates only structural policy data; quota and claim window remain Admin-configured. */
export function defineJointLeavePolicy(
  input: JointLeavePolicyInput,
): JointLeavePolicyInput {
  if (
    !Number.isSafeInteger(input.applicableYear) ||
    !Number.isSafeInteger(input.creditYear)
  ) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Tahun kebijakan harus berupa bilangan bulat.",
    );
  }
  if (!Number.isSafeInteger(input.quotaDays) || input.quotaDays < 0) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Kuota harus berupa bilangan bulat non-negatif.",
    );
  }
  if (input.claimOpensAt.getTime() > input.claimDeadlineAt.getTime()) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Pembukaan klaim tidak boleh setelah tenggat.",
    );
  }
  if (
    input.eventDates.length === 0 ||
    new Set(input.eventDates).size !== input.eventDates.length
  ) {
    throw new LeaveBalancePolicyError(
      "VALIDATION",
      "Tanggal Cuti Bersama harus tersedia dan unik.",
    );
  }
  for (const date of input.eventDates) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      Number(date.slice(0, 4)) !== input.applicableYear
    ) {
      throw new LeaveBalancePolicyError(
        "VALIDATION",
        "Tanggal Cuti Bersama harus valid untuk applicableYear.",
      );
    }
  }
  return Object.freeze({
    ...input,
    eventDates: Object.freeze([...input.eventDates]),
  });
}
