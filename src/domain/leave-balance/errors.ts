export type LeaveBalancePolicyErrorCode =
  | "VALIDATION"
  | "DUPLICATE_CALENDAR_DATE"
  | "INSUFFICIENT_BALANCE"
  | "EXCESSIVE_RESTORATION";

export class LeaveBalancePolicyError extends Error {
  constructor(
    public readonly code: LeaveBalancePolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LeaveBalancePolicyError";
  }
}
