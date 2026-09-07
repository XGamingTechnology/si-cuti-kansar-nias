import type { AnnualBalanceBucket } from "@/domain/leave-balance";

export type AnnualBalanceOperationKind =
  | "GRANT"
  | "RESERVE"
  | "RELEASE"
  | "COMMIT"
  | "REVERSAL"
  | "ADJUSTMENT";

export type AnnualBalanceAccountState = Readonly<{
  id: string;
  employeeId: string;
  entitlementYear: number;
  bucket: AnnualBalanceBucket;
  grantedDays: number;
  reservedDays: number;
  committedDays: number;
  availableDays: number;
}>;

export type AnnualBalanceOperationRecord = Readonly<{
  id: string;
  employeeId: string;
  entitlementYear: number;
  bucket: AnnualBalanceBucket;
  operationType: AnnualBalanceOperationKind;
  days: number;
  occurredAt: Date;
  idempotencyKey: string;
  referenceType: string | null;
  referenceId: string | null;
  compensatesOperationId: string | null;
  reason: string | null;
}>;

export type BalanceCounterUpdate = Readonly<{
  accountId: string;
  grantedDays: number;
  reservedDays: number;
  committedDays: number;
}>;

export type AppendBalanceOperation = Readonly<{
  employeeId: string;
  entitlementYear: number;
  bucket: AnnualBalanceBucket;
  operationType: AnnualBalanceOperationKind;
  days: number;
  occurredAt: Date;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  compensatesOperationId?: string | null;
  reason?: string | null;
}>;

export interface LockedAnnualBalanceTransaction {
  readonly accounts: readonly AnnualBalanceAccountState[];
  updateCounters(input: BalanceCounterUpdate): Promise<AnnualBalanceAccountState>;
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperationRecord>;
  findOperationsByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<readonly AnnualBalanceOperationRecord[]>;
  findReversalsForOperationIds(
    operationIds: readonly string[],
  ): Promise<readonly AnnualBalanceOperationRecord[]>;
}

export interface AnnualBalanceMutationRepository {
  withLockedAccounts<T>(
    employeeId: string,
    entitlementYear: number,
    buckets: readonly AnnualBalanceBucket[],
    work: (transaction: LockedAnnualBalanceTransaction) => Promise<T>,
  ): Promise<T>;
}

export type N2QualifyingPeriodState = Readonly<{
  firstZeroUsageYear: number;
  secondZeroUsageYear: number;
  creditedYear: number;
  grantedDays: number;
}>;

export type AnnualRolloverCommitState = Readonly<{
  id: string;
  employeeId: string;
  targetYear: number;
  committedAt: Date;
  idempotencyKey: string;
}>;

export type AnnualRolloverSnapshot = Readonly<{
  employeeId: string;
  targetYear: number;
  previousYearAccounts: readonly AnnualBalanceAccountState[];
  twoYearsAgoAccounts: readonly AnnualBalanceAccountState[];
  previousYearOperations: readonly AnnualBalanceOperationRecord[];
  twoYearsAgoOperations: readonly AnnualBalanceOperationRecord[];
  consumedQualifyingPeriods: readonly N2QualifyingPeriodState[];
  existingRolloverCommit: AnnualRolloverCommitState | null;
  targetYearAccounts: readonly AnnualBalanceAccountState[];
}>;

export interface LockedAnnualRolloverTransaction {
  readonly snapshot: AnnualRolloverSnapshot;
  createAccount(input: Readonly<{
    employeeId: string;
    entitlementYear: number;
    bucket: AnnualBalanceBucket;
    grantedDays: number;
  }>): Promise<AnnualBalanceAccountState>;
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperationRecord>;
  createN2QualifyingPeriod(input: Readonly<{
    employeeId: string;
    firstZeroUsageYear: number;
    secondZeroUsageYear: number;
    creditedYear: number;
    grantedDays: number;
    consumedAt: Date;
  }>): Promise<N2QualifyingPeriodState>;
  createRolloverCommit(input: Readonly<{
    employeeId: string;
    targetYear: number;
    committedAt: Date;
    idempotencyKey: string;
  }>): Promise<AnnualRolloverCommitState>;
}

export interface AnnualRolloverRepository {
  getRolloverSnapshot(
    employeeId: string,
    targetYear: number,
  ): Promise<AnnualRolloverSnapshot>;
  withLockedRollover<T>(
    employeeId: string,
    targetYear: number,
    work: (transaction: LockedAnnualRolloverTransaction) => Promise<T>,
  ): Promise<T>;
}
