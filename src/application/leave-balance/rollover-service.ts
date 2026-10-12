import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
  calculateAnnualRollover,
  deriveN2WasUsed,
  deriveNetAnnualLeaveUsageDays,
  type AnnualBalanceBucket,
  type AnnualRollover,
} from "@/domain/leave-balance";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceOperationRecord,
  AnnualRolloverCommitState,
  AnnualRolloverRepository,
  AnnualRolloverSnapshot,
} from "./ports";

export type AnnualRolloverErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVARIANT";

export class AnnualRolloverError extends Error {
  constructor(
    public readonly code: AnnualRolloverErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnnualRolloverError";
  }
}

export type AnnualRolloverPreviewInput = Readonly<{
  employeeId: string;
  targetYear: number;
}>;

export type AnnualRolloverCommitInput = AnnualRolloverPreviewInput &
  Readonly<{
    idempotencyKey: string;
    committedAt?: Date;
  }>;

export type AnnualRolloverPreviewResult = Readonly<{
  employeeId: string;
  targetYear: number;
  previousYear: number;
  twoYearsAgo: number;
  previousYearNRemaining: number;
  previousYearEffectiveAnnualLeaveUsageDays: number;
  twoYearsAgoEffectiveAnnualLeaveUsageDays: number;
  currentN2Remaining: number;
  currentN2WasUsed: boolean;
  calculation: AnnualRollover;
  qualifyingPeriodKey: string;
  alreadyCommitted: boolean;
}>;

export type AnnualRolloverCommitResult = Readonly<{
  preview: AnnualRolloverPreviewResult;
  rolloverCommit: AnnualRolloverCommitState;
  targetYearAccounts: readonly AnnualBalanceAccountState[];
  operations: readonly AnnualBalanceOperationRecord[];
}>;

function requireText(value: string, field: string, max = 191): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    throw new AnnualRolloverError(
      "VALIDATION",
      `${field} wajib diisi dan maksimal ${max} karakter.`,
    );
  }
  return trimmed;
}

function requireTargetYear(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1902 || value > 9999) {
    throw new AnnualRolloverError("VALIDATION", "Tahun rollover tidak valid.");
  }
  return value;
}

function byBucket(
  accounts: readonly AnnualBalanceAccountState[],
): ReadonlyMap<AnnualBalanceBucket, AnnualBalanceAccountState> {
  return new Map(accounts.map((account) => [account.bucket, account]));
}

function requireRegularHistory(
  accounts: readonly AnnualBalanceAccountState[],
  year: number,
): ReadonlyMap<AnnualBalanceBucket, AnnualBalanceAccountState> {
  const map = byBucket(accounts);
  for (const bucket of ["N2", "N1", "N"] as const) {
    if (!map.has(bucket)) {
      throw new AnnualRolloverError(
        "INVARIANT",
        `Riwayat akun saldo ${bucket} tahun ${year} belum tersedia.`,
      );
    }
  }
  return map;
}

function ensureNoOutstandingReservations(
  accounts: readonly AnnualBalanceAccountState[],
  year: number,
): void {
  if (accounts.some(({ reservedDays }) => reservedDays > 0)) {
    throw new AnnualRolloverError(
      "CONFLICT",
      `Rollover tidak dapat dilakukan karena masih ada saldo reserved tahun ${year}.`,
    );
  }
}

function totalOperationDays(
  operations: readonly AnnualBalanceOperationRecord[],
  operationType: "COMMIT" | "REVERSAL",
  bucket?: AnnualBalanceBucket,
): number {
  return operations
    .filter(
      (operation) =>
        operation.operationType === operationType &&
        (bucket === undefined || operation.bucket === bucket),
    )
    .reduce((total, operation) => total + operation.days, 0);
}

function effectiveAnnualUsage(
  operations: readonly AnnualBalanceOperationRecord[],
): number {
  return deriveNetAnnualLeaveUsageDays({
    committedDays: totalOperationDays(operations, "COMMIT"),
    reversedDays: totalOperationDays(operations, "REVERSAL"),
  });
}

function derivePreview(snapshot: AnnualRolloverSnapshot): AnnualRolloverPreviewResult {
  const { employeeId, targetYear } = snapshot;
  const previousYear = targetYear - 1;
  const twoYearsAgo = targetYear - 2;

  const previousAccounts = requireRegularHistory(
    snapshot.previousYearAccounts,
    previousYear,
  );
  requireRegularHistory(snapshot.twoYearsAgoAccounts, twoYearsAgo);
  ensureNoOutstandingReservations(snapshot.previousYearAccounts, previousYear);

  const previousN = previousAccounts.get("N")!;
  const previousN2 = previousAccounts.get("N2")!;

  const previousYearEffectiveAnnualLeaveUsageDays = effectiveAnnualUsage(
    snapshot.previousYearOperations,
  );
  const twoYearsAgoEffectiveAnnualLeaveUsageDays = effectiveAnnualUsage(
    snapshot.twoYearsAgoOperations,
  );

  const n2CommittedDays = totalOperationDays(
    snapshot.previousYearOperations,
    "COMMIT",
    "N2",
  );
  const n2ReversedDays = totalOperationDays(
    snapshot.previousYearOperations,
    "REVERSAL",
    "N2",
  );
  const currentN2WasUsed = deriveN2WasUsed({
    committedDays: n2CommittedDays,
    reversedDays: n2ReversedDays,
  });

  const consumedQualifyingPeriods = snapshot.consumedQualifyingPeriods.map(
    ({ firstZeroUsageYear, secondZeroUsageYear }) =>
      `${firstZeroUsageYear}:${secondZeroUsageYear}`,
  );

  const calculation = calculateAnnualRollover({
    previousYearNRemaining: previousN.availableDays,
    previousYearCommittedAnnualLeaveDays:
      previousYearEffectiveAnnualLeaveUsageDays,
    twoYearsAgoCommittedAnnualLeaveDays:
      twoYearsAgoEffectiveAnnualLeaveUsageDays,
    currentN2Remaining: previousN2.availableDays,
    currentN2WasUsed,
    firstQualifyingYear: twoYearsAgo,
    secondQualifyingYear: previousYear,
    consumedQualifyingPeriods,
  });

  return Object.freeze({
    employeeId,
    targetYear,
    previousYear,
    twoYearsAgo,
    previousYearNRemaining: previousN.availableDays,
    previousYearEffectiveAnnualLeaveUsageDays,
    twoYearsAgoEffectiveAnnualLeaveUsageDays,
    currentN2Remaining: previousN2.availableDays,
    currentN2WasUsed,
    calculation,
    qualifyingPeriodKey: `${twoYearsAgo}:${previousYear}`,
    alreadyCommitted: snapshot.existingRolloverCommit !== null,
  });
}

function rolloverOperationKey(
  base: string,
  bucket: AnnualBalanceBucket,
): string {
  const key = `${base}:rollover:grant:${bucket}`;
  if (key.length > 191) {
    throw new AnnualRolloverError(
      "VALIDATION",
      "Idempotency key rollover terlalu panjang.",
    );
  }
  return key;
}

function targetGrantDays(
  bucket: AnnualBalanceBucket,
  calculation: AnnualRollover,
): number {
  switch (bucket) {
    case "JOINT_LEAVE_CLAIM":
      return 0;
    case "N2":
      return calculation.n2;
    case "N1":
      return calculation.n1;
    case "N":
      return calculation.n;
  }
}

export class AnnualRolloverService {
  constructor(private readonly repository: AnnualRolloverRepository) {}

  async previewAnnualRollover(
    input: AnnualRolloverPreviewInput,
  ): Promise<AnnualRolloverPreviewResult> {
    const employeeId = requireText(input.employeeId, "employeeId");
    const targetYear = requireTargetYear(input.targetYear);
    return derivePreview(
      await this.repository.getRolloverSnapshot(employeeId, targetYear),
    );
  }

  commitAnnualRollover(
    input: AnnualRolloverCommitInput,
  ): Promise<AnnualRolloverCommitResult> {
    const employeeId = requireText(input.employeeId, "employeeId");
    const targetYear = requireTargetYear(input.targetYear);
    const idempotencyKey = requireText(
      input.idempotencyKey,
      "idempotencyKey",
      140,
    );
    const committedAt = input.committedAt ?? new Date();

    return this.repository.withLockedRollover(
      employeeId,
      targetYear,
      async (transaction) => {
        const preview = derivePreview(transaction.snapshot);
        const existingCommit = transaction.snapshot.existingRolloverCommit;
        if (existingCommit) {
          return {
            preview,
            rolloverCommit: existingCommit,
            targetYearAccounts: transaction.snapshot.targetYearAccounts,
            operations: [],
          };
        }

        if (transaction.snapshot.targetYearAccounts.length > 0) {
          throw new AnnualRolloverError(
            "CONFLICT",
            `Akun saldo tahun ${targetYear} sudah ada sebelum rollover committed.`,
          );
        }

        const createdAccounts: AnnualBalanceAccountState[] = [];
        const createdOperations: AnnualBalanceOperationRecord[] = [];
        for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
          const grantedDays = targetGrantDays(bucket, preview.calculation);
          createdAccounts.push(
            await transaction.createAccount({
              employeeId,
              entitlementYear: targetYear,
              bucket,
              grantedDays,
            }),
          );
          if (grantedDays === 0) continue;
          createdOperations.push(
            await transaction.append({
              employeeId,
              entitlementYear: targetYear,
              bucket,
              operationType: "GRANT",
              days: grantedDays,
              occurredAt: committedAt,
              idempotencyKey: rolloverOperationKey(idempotencyKey, bucket),
              referenceType: "ANNUAL_ROLLOVER",
              referenceId: `${employeeId}:${targetYear}`,
              reason: `Rollover saldo Cuti Tahunan ke tahun ${targetYear}`,
            }),
          );
        }

        if (preview.calculation.n2GrantedDays > 0) {
          await transaction.createN2QualifyingPeriod({
            employeeId,
            firstZeroUsageYear: preview.twoYearsAgo,
            secondZeroUsageYear: preview.previousYear,
            creditedYear: targetYear,
            grantedDays: preview.calculation.n2GrantedDays,
            consumedAt: committedAt,
          });
        }

        const rolloverCommit = await transaction.createRolloverCommit({
          employeeId,
          targetYear,
          committedAt,
          idempotencyKey,
        });

        return {
          preview: Object.freeze({ ...preview, alreadyCommitted: true }),
          rolloverCommit,
          targetYearAccounts: Object.freeze(createdAccounts),
          operations: Object.freeze(createdOperations),
        };
      },
    );
  }
}
