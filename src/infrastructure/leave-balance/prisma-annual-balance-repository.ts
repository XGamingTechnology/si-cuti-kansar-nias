import type {
  AnnualBalanceAccount,
  AnnualBalanceOperation,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceMutationRepository,
  AnnualRolloverRepository,
  AnnualRolloverSnapshot,
  AppendBalanceOperation,
  BalanceCounterUpdate,
  LockedAnnualBalanceTransaction,
  LockedAnnualRolloverTransaction,
} from "@/application/leave-balance/ports";

export type LockedAnnualBalanceAccount = AnnualBalanceAccountState;

export interface AnnualBalanceLedgerWriter {
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperation>;
}

export type LockedAnnualBalanceWork<T> = (
  transaction: LockedAnnualBalanceTransaction,
) => Promise<T>;

type LockedAccountRow = Omit<LockedAnnualBalanceAccount, "availableDays">;
type RolloverDatabase = PrismaClient | Prisma.TransactionClient;

function withAvailable(account: LockedAccountRow): LockedAnnualBalanceAccount {
  return {
    ...account,
    availableDays:
      account.grantedDays - account.reservedDays - account.committedDays,
  };
}

async function buildRolloverSnapshot(
  database: RolloverDatabase,
  employeeId: string,
  targetYear: number,
): Promise<AnnualRolloverSnapshot> {
  const previousYear = targetYear - 1;
  const twoYearsAgo = targetYear - 2;
  const [accounts, operations, consumedQualifyingPeriods, existingRolloverCommit] =
    await Promise.all([
      database.annualBalanceAccount.findMany({
        where: {
          employeeId,
          entitlementYear: { in: [twoYearsAgo, previousYear, targetYear] },
        },
        orderBy: [{ entitlementYear: "asc" }, { bucket: "asc" }],
      }),
      database.annualBalanceOperation.findMany({
        where: {
          employeeId,
          entitlementYear: { in: [twoYearsAgo, previousYear] },
          operationType: { in: ["COMMIT", "REVERSAL"] },
        },
        orderBy: [{ entitlementYear: "asc" }, { occurredAt: "asc" }, { createdAt: "asc" }],
      }),
      database.n2QualifyingPeriod.findMany({
        where: { employeeId },
        orderBy: [{ firstZeroUsageYear: "asc" }, { secondZeroUsageYear: "asc" }],
      }),
      database.annualRolloverCommit.findFirst({
        where: { employeeId, targetYear },
      }),
    ]);

  return {
    employeeId,
    targetYear,
    previousYearAccounts: accounts
      .filter(({ entitlementYear }) => entitlementYear === previousYear)
      .map(withAvailable),
    twoYearsAgoAccounts: accounts
      .filter(({ entitlementYear }) => entitlementYear === twoYearsAgo)
      .map(withAvailable),
    previousYearOperations: operations.filter(
      ({ entitlementYear }) => entitlementYear === previousYear,
    ),
    twoYearsAgoOperations: operations.filter(
      ({ entitlementYear }) => entitlementYear === twoYearsAgo,
    ),
    consumedQualifyingPeriods,
    existingRolloverCommit,
    targetYearAccounts: accounts
      .filter(({ entitlementYear }) => entitlementYear === targetYear)
      .map(withAvailable),
  };
}

class PrismaLockedAnnualBalanceTransaction
  implements LockedAnnualBalanceTransaction
{
  constructor(
    private readonly transaction: Prisma.TransactionClient,
    public readonly accounts: readonly LockedAnnualBalanceAccount[],
  ) {}

  async updateCounters(
    input: BalanceCounterUpdate,
  ): Promise<LockedAnnualBalanceAccount> {
    if (!this.accounts.some(({ id }) => id === input.accountId)) {
      throw new Error("Akun saldo harus dikunci sebelum diperbarui.");
    }
    const updated = await this.transaction.annualBalanceAccount.update({
      where: { id: input.accountId },
      data: {
        grantedDays: input.grantedDays,
        reservedDays: input.reservedDays,
        committedDays: input.committedDays,
      },
    });
    return withAvailable(updated);
  }

  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperation> {
    return this.transaction.annualBalanceOperation.create({ data: input });
  }

  findOperationsByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<AnnualBalanceOperation[]> {
    return this.transaction.annualBalanceOperation.findMany({
      where: { referenceType, referenceId },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    });
  }

  findReversalsForOperationIds(
    operationIds: readonly string[],
  ): Promise<AnnualBalanceOperation[]> {
    if (operationIds.length === 0) return Promise.resolve([]);
    return this.transaction.annualBalanceOperation.findMany({
      where: {
        operationType: "REVERSAL",
        compensatesOperationId: { in: [...operationIds] },
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    });
  }
}

class PrismaLockedAnnualRolloverTransaction
  implements LockedAnnualRolloverTransaction
{
  constructor(
    private readonly transaction: Prisma.TransactionClient,
    public readonly snapshot: AnnualRolloverSnapshot,
  ) {}

  async createAccount(input: {
    employeeId: string;
    entitlementYear: number;
    bucket: AnnualBalanceBucket;
    grantedDays: number;
  }): Promise<AnnualBalanceAccountState> {
    return withAvailable(
      await this.transaction.annualBalanceAccount.create({ data: input }),
    );
  }

  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperation> {
    return this.transaction.annualBalanceOperation.create({ data: input });
  }

  createN2QualifyingPeriod(input: {
    employeeId: string;
    firstZeroUsageYear: number;
    secondZeroUsageYear: number;
    creditedYear: number;
    grantedDays: number;
    consumedAt: Date;
  }) {
    return this.transaction.n2QualifyingPeriod.create({ data: input });
  }

  createRolloverCommit(input: {
    employeeId: string;
    targetYear: number;
    committedAt: Date;
    idempotencyKey: string;
  }) {
    return this.transaction.annualRolloverCommit.create({ data: input });
  }
}

export class PrismaAnnualBalanceRepository
  implements AnnualBalanceMutationRepository, AnnualRolloverRepository
{
  constructor(private readonly database: PrismaClient) {}

  createAccount(input: {
    employeeId: string;
    entitlementYear: number;
    bucket: AnnualBalanceBucket;
    grantedDays: number;
    reservedDays?: number;
    committedDays?: number;
  }): Promise<AnnualBalanceAccount> {
    return this.database.annualBalanceAccount.create({ data: input });
  }

  getRolloverSnapshot(
    employeeId: string,
    targetYear: number,
  ): Promise<AnnualRolloverSnapshot> {
    return buildRolloverSnapshot(this.database, employeeId, targetYear);
  }

  withLockedAccounts<T>(
    employeeId: string,
    entitlementYear: number,
    buckets: readonly AnnualBalanceBucket[],
    work: LockedAnnualBalanceWork<T>,
  ): Promise<T> {
    if (buckets.length === 0)
      throw new Error("Sedikitnya satu bucket saldo harus dikunci.");

    return this.database.$transaction(async (transaction) => {
      const accounts = await transaction.$queryRaw<
        LockedAccountRow[]
      >(Prisma.sql`
        SELECT "id", "employeeId", "entitlementYear", "bucket",
               "grantedDays", "reservedDays", "committedDays"
        FROM "AnnualBalanceAccount"
        WHERE "employeeId" = ${employeeId}::uuid
          AND "entitlementYear" = ${entitlementYear}
          AND "bucket"::text IN (${Prisma.join(buckets)})
        ORDER BY CASE "bucket"
          WHEN 'JOINT_LEAVE_CLAIM' THEN 1
          WHEN 'N2' THEN 2
          WHEN 'N1' THEN 3
          WHEN 'N' THEN 4
        END
        FOR UPDATE
      `);
      return work(
        new PrismaLockedAnnualBalanceTransaction(
          transaction,
          accounts.map(withAvailable),
        ),
      );
    });
  }

  withLockedRollover<T>(
    employeeId: string,
    targetYear: number,
    work: (transaction: LockedAnnualRolloverTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(async (transaction) => {
      const employees = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id"
        FROM "Employee"
        WHERE "id" = ${employeeId}::uuid
        FOR UPDATE
      `);
      if (employees.length === 0) {
        throw new Error("Pegawai untuk rollover tidak ditemukan.");
      }
      const snapshot = await buildRolloverSnapshot(
        transaction,
        employeeId,
        targetYear,
      );
      return work(
        new PrismaLockedAnnualRolloverTransaction(transaction, snapshot),
      );
    });
  }
}
