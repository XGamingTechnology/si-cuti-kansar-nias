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
  AppendBalanceOperation,
  BalanceCounterUpdate,
  LockedAnnualBalanceTransaction,
} from "@/application/leave-balance/ports";

export type LockedAnnualBalanceAccount = AnnualBalanceAccountState;

export interface AnnualBalanceLedgerWriter {
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperation>;
}

export type LockedAnnualBalanceWork<T> = (
  transaction: LockedAnnualBalanceTransaction,
) => Promise<T>;

type LockedAccountRow = Omit<LockedAnnualBalanceAccount, "availableDays">;

function withAvailable(account: LockedAccountRow): LockedAnnualBalanceAccount {
  return {
    ...account,
    availableDays:
      account.grantedDays - account.reservedDays - account.committedDays,
  };
}

class PrismaLockedAnnualBalanceTransaction implements LockedAnnualBalanceTransaction {
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

export class PrismaAnnualBalanceRepository
  implements AnnualBalanceMutationRepository
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
}
