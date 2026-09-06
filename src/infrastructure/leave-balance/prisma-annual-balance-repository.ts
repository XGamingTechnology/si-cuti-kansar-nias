import type {
  AnnualBalanceAccount,
  AnnualBalanceOperation,
  AnnualBalanceOperationType,
  PrismaClient,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";

export type LockedAnnualBalanceAccount = Readonly<
  Pick<
    AnnualBalanceAccount,
    | "id"
    | "employeeId"
    | "entitlementYear"
    | "bucket"
    | "grantedDays"
    | "reservedDays"
    | "committedDays"
  > & { availableDays: number }
>;

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
  operationType: AnnualBalanceOperationType;
  days: number;
  occurredAt: Date;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  compensatesOperationId?: string | null;
  reason?: string | null;
}>;

/** Append-only business boundary: intentionally has no update or delete operation. */
export interface AnnualBalanceLedgerWriter {
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperation>;
}

export interface LockedAnnualBalanceTransaction extends AnnualBalanceLedgerWriter {
  readonly accounts: readonly LockedAnnualBalanceAccount[];
  updateCounters(
    input: BalanceCounterUpdate,
  ): Promise<LockedAnnualBalanceAccount>;
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
}

export class PrismaAnnualBalanceRepository {
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
