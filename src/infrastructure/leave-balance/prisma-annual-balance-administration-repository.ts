import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AnnualBalanceAdministrationRepository,
  AnnualBalanceEmployee,
  LockedOpeningBalanceTransaction,
} from "@/application/leave-balance/administration";
import { OpeningBalancePersistenceConflict } from "@/application/leave-balance/administration";
import type { AppendBalanceOperation } from "@/application/leave-balance/ports";

function withAvailable<
  T extends {
    grantedDays: number;
    reservedDays: number;
    committedDays: number;
  },
>(account: T) {
  return {
    ...account,
    availableDays:
      account.grantedDays - account.reservedDays - account.committedDays,
  };
}

function employeeShape(employee: AnnualBalanceEmployee): AnnualBalanceEmployee {
  return {
    id: employee.id,
    nip: employee.nip,
    fullName: employee.fullName,
    isActive: employee.isActive,
  };
}

export class PrismaAnnualBalanceAdministrationRepository implements AnnualBalanceAdministrationRepository {
  constructor(private readonly database: PrismaClient) {}

  async listActiveEmployees() {
    return (
      await this.database.employee.findMany({
        where: { isActive: true },
        select: { id: true, nip: true, fullName: true, isActive: true },
        orderBy: [{ fullName: "asc" }, { nip: "asc" }],
      })
    ).map(employeeShape);
  }

  async findEmployee(employeeId: string) {
    const employee = await this.database.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, nip: true, fullName: true, isActive: true },
    });
    return employee ? employeeShape(employee) : null;
  }

  async findAccounts(employeeId: string, entitlementYear: number) {
    return (
      await this.database.annualBalanceAccount.findMany({
        where: { employeeId, entitlementYear },
        orderBy: { bucket: "asc" },
      })
    ).map(withAvailable);
  }

  findHistory(employeeId: string, entitlementYear: number) {
    return this.database.annualBalanceOperation.findMany({
      where: { employeeId, entitlementYear },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
  }

  async withLockedEmployee<T>(
    employeeId: string,
    entitlementYear: number,
    work: (transaction: LockedOpeningBalanceTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const employees = await transaction.$queryRaw<
          AnnualBalanceEmployee[]
        >(Prisma.sql`
          SELECT "id", "nip", "fullName", "isActive"
          FROM "Employee"
          WHERE "id" = ${employeeId}::uuid
          FOR UPDATE
        `);
        const accounts = (
          await transaction.annualBalanceAccount.findMany({
            where: { employeeId, entitlementYear },
            orderBy: { bucket: "asc" },
          })
        ).map(withAvailable);
        return work({
          employee: employees[0] ? employeeShape(employees[0]) : null,
          accounts,
          createAccount: async (input) =>
            withAvailable(
              await transaction.annualBalanceAccount.create({ data: input }),
            ),
          append: (input: AppendBalanceOperation) =>
            transaction.annualBalanceOperation.create({ data: input }),
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new OpeningBalancePersistenceConflict();
      }
      throw error;
    }
  }
}
