export const ANNUAL_N_ENTITLEMENT_DAYS = 12;
export const ANNUAL_CARRY_CAP_DAYS = 6;

export const ANNUAL_BALANCE_BUCKET_PRIORITY = [
  "JOINT_LEAVE_CLAIM",
  "N2",
  "N1",
  "N",
] as const;

export type AnnualBalanceBucket =
  (typeof ANNUAL_BALANCE_BUCKET_PRIORITY)[number];

export type AnnualBalanceBuckets = Readonly<
  Record<AnnualBalanceBucket, number>
>;
