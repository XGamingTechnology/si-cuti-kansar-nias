import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
  allocateAnnualBalance,
  calculateRestorationOperations,
  type AnnualBalanceBucket,
  type AnnualBalanceBuckets,
} from "@/domain/leave-balance";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceMutationRepository,
  AnnualBalanceOperationRecord,
  LockedAnnualBalanceTransaction,
} from "./ports";

export type BalanceMutationErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVARIANT";

export class BalanceMutationError extends Error {
  constructor(
    public readonly code: BalanceMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BalanceMutationError";
  }
}

export type BalanceMutationReference = Readonly<{
  referenceType: string;
  referenceId: string;
}>;

export type AnnualBalanceMutationInput = Readonly<{
  employeeId: string;
  entitlementYear: number;
  reference: BalanceMutationReference;
  idempotencyKey: string;
  occurredAt?: Date;
  reason?: string;
}>;

export type ReserveAnnualLeaveInput = AnnualBalanceMutationInput &
  Readonly<{ requestedDays: number }>;

export type ReverseCommittedAnnualLeaveInput = AnnualBalanceMutationInput &
  Readonly<{ restoreDays: number }>;

export type AnnualBalanceMutationResult = Readonly<{
  operations: readonly AnnualBalanceOperationRecord[];
  accounts: readonly AnnualBalanceAccountState[];
}>;

function requireText(value: string, field: string, max = 191): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    throw new BalanceMutationError(
      "VALIDATION",
      `${field} wajib diisi dan maksimal ${max} karakter.`,
    );
  }
  return trimmed;
}

function requireYear(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 9999) {
    throw new BalanceMutationError("VALIDATION", "Tahun saldo tidak valid.");
  }
  return value;
}

function operationKey(
  base: string,
  action: string,
  bucket: AnnualBalanceBucket,
): string {
  const key = `${base}:${action}:${bucket}`;
  if (key.length > 191) {
    throw new BalanceMutationError(
      "VALIDATION",
      "Idempotency key terlalu panjang setelah penambahan bucket.",
    );
  }
  return key;
}

function reversalOperationKey(
  base: string,
  bucket: AnnualBalanceBucket,
  commitOperationId: string,
): string {
  const key = `${base}:reversal:${bucket}:${commitOperationId}`;
  if (key.length > 191) {
    throw new BalanceMutationError(
      "VALIDATION",
      "Idempotency key reversal terlalu panjang.",
    );
  }
  return key;
}

function byBucket(
  accounts: readonly AnnualBalanceAccountState[],
): ReadonlyMap<AnnualBalanceBucket, AnnualBalanceAccountState> {
  const result = new Map<AnnualBalanceBucket, AnnualBalanceAccountState>();
  for (const account of accounts) result.set(account.bucket, account);
  return result;
}

function requireAllBuckets(
  accounts: readonly AnnualBalanceAccountState[],
): ReadonlyMap<AnnualBalanceBucket, AnnualBalanceAccountState> {
  const map = byBucket(accounts);
  for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
    if (!map.has(bucket)) {
      throw new BalanceMutationError(
        "INVARIANT",
        `Akun saldo ${bucket} belum tersedia untuk tahun tersebut.`,
      );
    }
  }
  return map;
}

function availableBuckets(
  accounts: ReadonlyMap<AnnualBalanceBucket, AnnualBalanceAccountState>,
): AnnualBalanceBuckets {
  return {
    JOINT_LEAVE_CLAIM: accounts.get("JOINT_LEAVE_CLAIM")!.availableDays,
    N2: accounts.get("N2")!.availableDays,
    N1: accounts.get("N1")!.availableDays,
    N: accounts.get("N")!.availableDays,
  };
}

function operationsByType(
  operations: readonly AnnualBalanceOperationRecord[],
  type: AnnualBalanceOperationRecord["operationType"],
): readonly AnnualBalanceOperationRecord[] {
  return operations.filter((operation) => operation.operationType === type);
}

function sumByBucket(
  operations: readonly AnnualBalanceOperationRecord[],
): Record<AnnualBalanceBucket, number> {
  const totals: Record<AnnualBalanceBucket, number> = {
    JOINT_LEAVE_CLAIM: 0,
    N2: 0,
    N1: 0,
    N: 0,
  };
  for (const operation of operations) totals[operation.bucket] += operation.days;
  return totals;
}

function totalDays(operations: readonly AnnualBalanceOperationRecord[]): number {
  return operations.reduce((total, operation) => total + operation.days, 0);
}

function validateReference(
  reference: BalanceMutationReference,
): BalanceMutationReference {
  return {
    referenceType: requireText(reference.referenceType, "referenceType", 100),
    referenceId: requireText(reference.referenceId, "referenceId"),
  };
}

async function persistAccountUpdate(
  transaction: LockedAnnualBalanceTransaction,
  account: AnnualBalanceAccountState,
  reservedDelta: number,
  committedDelta: number,
): Promise<AnnualBalanceAccountState> {
  const reservedDays = account.reservedDays + reservedDelta;
  const committedDays = account.committedDays + committedDelta;
  if (reservedDays < 0 || committedDays < 0) {
    throw new BalanceMutationError(
      "INVARIANT",
      "Mutasi saldo menghasilkan counter negatif.",
    );
  }
  return transaction.updateCounters({
    accountId: account.id,
    grantedDays: account.grantedDays,
    reservedDays,
    committedDays,
  });
}

export class AnnualBalanceMutationService {
  constructor(private readonly repository: AnnualBalanceMutationRepository) {}

  reserveAnnualLeave(
    input: ReserveAnnualLeaveInput,
  ): Promise<AnnualBalanceMutationResult> {
    const employeeId = requireText(input.employeeId, "employeeId");
    const entitlementYear = requireYear(input.entitlementYear);
    const reference = validateReference(input.reference);
    const idempotencyKey = requireText(
      input.idempotencyKey,
      "idempotencyKey",
      140,
    );
    const occurredAt = input.occurredAt ?? new Date();

    return this.repository.withLockedAccounts(
      employeeId,
      entitlementYear,
      ANNUAL_BALANCE_BUCKET_PRIORITY,
      async (transaction) => {
        const existing = await transaction.findOperationsByReference(
          reference.referenceType,
          reference.referenceId,
        );
        const priorReserves = operationsByType(existing, "RESERVE");
        if (priorReserves.length > 0) {
          if (totalDays(priorReserves) !== input.requestedDays) {
            throw new BalanceMutationError(
              "CONFLICT",
              "Referensi sudah memiliki reservasi dengan jumlah hari yang berbeda.",
            );
          }
          return { operations: priorReserves, accounts: transaction.accounts };
        }
        if (existing.length > 0) {
          throw new BalanceMutationError(
            "CONFLICT",
            "Referensi ini sudah memiliki mutasi saldo lain dan tidak dapat di-reserve ulang.",
          );
        }

        const accounts = requireAllBuckets(transaction.accounts);
        const allocation = allocateAnnualBalance({
          requestedDays: input.requestedDays,
          available: availableBuckets(accounts),
        });

        const created: AnnualBalanceOperationRecord[] = [];
        for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
          const days = allocation.allocations[bucket];
          if (days === 0) continue;
          const account = accounts.get(bucket)!;
          await persistAccountUpdate(transaction, account, days, 0);
          created.push(
            await transaction.append({
              employeeId,
              entitlementYear,
              bucket,
              operationType: "RESERVE",
              days,
              occurredAt,
              idempotencyKey: operationKey(idempotencyKey, "reserve", bucket),
              referenceType: reference.referenceType,
              referenceId: reference.referenceId,
              reason: input.reason ?? null,
            }),
          );
        }
        return { operations: created, accounts: transaction.accounts };
      },
    );
  }

  commitAnnualLeave(
    input: AnnualBalanceMutationInput,
  ): Promise<AnnualBalanceMutationResult> {
    return this.finishReservation(input, "COMMIT");
  }

  releaseAnnualLeaveReservation(
    input: AnnualBalanceMutationInput,
  ): Promise<AnnualBalanceMutationResult> {
    return this.finishReservation(input, "RELEASE");
  }

  reverseCommittedAnnualLeave(
    input: ReverseCommittedAnnualLeaveInput,
  ): Promise<AnnualBalanceMutationResult> {
    const employeeId = requireText(input.employeeId, "employeeId");
    const entitlementYear = requireYear(input.entitlementYear);
    const reference = validateReference(input.reference);
    const idempotencyKey = requireText(
      input.idempotencyKey,
      "idempotencyKey",
      140,
    );
    const occurredAt = input.occurredAt ?? new Date();

    if (!Number.isSafeInteger(input.restoreDays) || input.restoreDays <= 0) {
      throw new BalanceMutationError(
        "VALIDATION",
        "Jumlah hari reversal harus berupa bilangan bulat positif.",
      );
    }

    return this.repository.withLockedAccounts(
      employeeId,
      entitlementYear,
      ANNUAL_BALANCE_BUCKET_PRIORITY,
      async (transaction) => {
        const existing = await transaction.findOperationsByReference(
          reference.referenceType,
          reference.referenceId,
        );
        const commits = operationsByType(existing, "COMMIT");
        if (commits.length === 0) {
          throw new BalanceMutationError(
            "NOT_FOUND",
            "COMMIT asal untuk referensi ini tidak ditemukan.",
          );
        }

        const retryPrefix = `${idempotencyKey}:reversal:`;
        const priorRetry = operationsByType(existing, "REVERSAL").filter(
          ({ idempotencyKey: key }) => key.startsWith(retryPrefix),
        );
        if (priorRetry.length > 0) {
          if (totalDays(priorRetry) !== input.restoreDays) {
            throw new BalanceMutationError(
              "CONFLICT",
              "Idempotency key reversal sudah digunakan dengan jumlah hari berbeda.",
            );
          }
          return { operations: priorRetry, accounts: transaction.accounts };
        }

        const reversals = await transaction.findReversalsForOperationIds(
          commits.map(({ id }) => id),
        );
        const reversedByCommit = new Map<string, number>();
        for (const reversal of reversals) {
          if (!reversal.compensatesOperationId) continue;
          reversedByCommit.set(
            reversal.compensatesOperationId,
            (reversedByCommit.get(reversal.compensatesOperationId) ?? 0) +
              reversal.days,
          );
        }

        const remainingCommits = commits
          .map((commit) => ({
            operationId: commit.id,
            bucket: commit.bucket,
            days: commit.days - (reversedByCommit.get(commit.id) ?? 0),
          }))
          .filter(({ days }) => days > 0);

        const instructions = calculateRestorationOperations(
          remainingCommits,
          input.restoreDays,
        );
        const accounts = requireAllBuckets(transaction.accounts);
        const created: AnnualBalanceOperationRecord[] = [];

        for (const instruction of instructions) {
          const account = accounts.get(instruction.bucket)!;
          await persistAccountUpdate(transaction, account, 0, -instruction.days);
          created.push(
            await transaction.append({
              employeeId,
              entitlementYear,
              bucket: instruction.bucket,
              operationType: "REVERSAL",
              days: instruction.days,
              occurredAt,
              idempotencyKey: reversalOperationKey(
                idempotencyKey,
                instruction.bucket,
                instruction.compensatesOperationId,
              ),
              referenceType: reference.referenceType,
              referenceId: reference.referenceId,
              compensatesOperationId: instruction.compensatesOperationId,
              reason: input.reason ?? null,
            }),
          );
        }
        return { operations: created, accounts: transaction.accounts };
      },
    );
  }

  private finishReservation(
    input: AnnualBalanceMutationInput,
    operationType: "COMMIT" | "RELEASE",
  ): Promise<AnnualBalanceMutationResult> {
    const employeeId = requireText(input.employeeId, "employeeId");
    const entitlementYear = requireYear(input.entitlementYear);
    const reference = validateReference(input.reference);
    const idempotencyKey = requireText(
      input.idempotencyKey,
      "idempotencyKey",
      140,
    );
    const occurredAt = input.occurredAt ?? new Date();

    return this.repository.withLockedAccounts(
      employeeId,
      entitlementYear,
      ANNUAL_BALANCE_BUCKET_PRIORITY,
      async (transaction) => {
        const existing = await transaction.findOperationsByReference(
          reference.referenceType,
          reference.referenceId,
        );
        const reserves = operationsByType(existing, "RESERVE");
        if (reserves.length === 0) {
          throw new BalanceMutationError(
            "NOT_FOUND",
            "Reservasi saldo untuk referensi ini tidak ditemukan.",
          );
        }

        const priorSame = operationsByType(existing, operationType);
        if (priorSame.length > 0) {
          return { operations: priorSame, accounts: transaction.accounts };
        }
        const opposingType = operationType === "COMMIT" ? "RELEASE" : "COMMIT";
        if (operationsByType(existing, opposingType).length > 0) {
          throw new BalanceMutationError(
            "CONFLICT",
            `Reservasi ini sudah diproses sebagai ${opposingType}.`,
          );
        }

        const reserved = sumByBucket(reserves);
        const accounts = requireAllBuckets(transaction.accounts);
        const created: AnnualBalanceOperationRecord[] = [];

        for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
          const days = reserved[bucket];
          if (days === 0) continue;
          const account = accounts.get(bucket)!;
          if (account.reservedDays < days) {
            throw new BalanceMutationError(
              "INVARIANT",
              `Counter reserved ${bucket} lebih kecil dari reservasi referensi.`,
            );
          }
          await persistAccountUpdate(
            transaction,
            account,
            -days,
            operationType === "COMMIT" ? days : 0,
          );
          created.push(
            await transaction.append({
              employeeId,
              entitlementYear,
              bucket,
              operationType,
              days,
              occurredAt,
              idempotencyKey: operationKey(
                idempotencyKey,
                operationType.toLowerCase(),
                bucket,
              ),
              referenceType: reference.referenceType,
              referenceId: reference.referenceId,
              reason: input.reason ?? null,
            }),
          );
        }
        return { operations: created, accounts: transaction.accounts };
      },
    );
  }
}
