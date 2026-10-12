import type {
  AnnualBalanceAdministrationRepository,
  AnnualBalanceEmployee,
  LockedOpeningBalanceTransaction,
} from "@/application/leave-balance/administration";
import type { BalanceImportEmployeeLookup } from "@/application/leave-balance/batch-import";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceOperationRecord,
} from "@/application/leave-balance/ports";

export const actorUserId = "00000000-0000-4000-8000-000000000098";
export const batchId = "00000000-0000-4000-8000-000000000099";
export const employeeA = {
  id: "00000000-0000-4000-8000-000000000001",
  nip: "TEST-098-A",
  fullName: "Pegawai Uji A",
  isActive: true,
};
export const employeeB = {
  id: "00000000-0000-4000-8000-000000000002",
  nip: "TEST-098-B",
  fullName: "Pegawai Uji B",
  isActive: true,
};
export const row = (
  nip = employeeA.nip,
  overrides: Partial<Record<number, string | number>> = {},
) =>
  Object.assign(
    [nip, "Nama Referensi", 2026, 12, 2, 3, 0, "Rekap saldo uji resmi"],
    overrides,
  );

export class BatchTestRepository
  implements AnnualBalanceAdministrationRepository, BalanceImportEmployeeLookup
{
  employees: AnnualBalanceEmployee[] = [employeeA, employeeB];
  accounts: AnnualBalanceAccountState[] = [];
  operations: AnnualBalanceOperationRecord[] = [];
  failEmployeeId: string | null = null;
  afterPreview: (() => void) | null = null;
  sequence = 0;
  async listActiveEmployees() {
    return this.employees.filter((employee) => employee.isActive);
  }
  async findEmployeesByNips(nips: readonly string[]) {
    return this.employees.filter((employee) => nips.includes(employee.nip));
  }
  async findEmployee(id: string) {
    return this.employees.find((employee) => employee.id === id) ?? null;
  }
  async findAccounts(id: string, year: number) {
    return this.accounts.filter(
      (account) =>
        account.employeeId === id && account.entitlementYear === year,
    );
  }
  async findHistory(id: string, year: number) {
    return this.operations.filter(
      (operation) =>
        operation.employeeId === id && operation.entitlementYear === year,
    );
  }
  async withLockedEmployee<T>(
    id: string,
    year: number,
    work: (transaction: LockedOpeningBalanceTransaction) => Promise<T>,
  ) {
    this.afterPreview?.();
    this.afterPreview = null;
    const accountsBefore = [...this.accounts];
    const operationsBefore = [...this.operations];
    try {
      return await work({
        employee: await this.findEmployee(id),
        accounts: await this.findAccounts(id, year),
        createAccount: async (input) => {
          const account = {
            ...input,
            id: `account-${++this.sequence}`,
            reservedDays: 0,
            committedDays: 0,
            availableDays: input.grantedDays,
          };
          this.accounts.push(account);
          return account;
        },
        append: async (input) => {
          if (this.failEmployeeId === id)
            throw new Error("private persistence details");
          const operation = {
            ...input,
            id: `operation-${++this.sequence}`,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            compensatesOperationId: input.compensatesOperationId ?? null,
            reason: input.reason ?? null,
          };
          this.operations.push(operation);
          return operation;
        },
      });
    } catch (error) {
      this.accounts = accountsBefore;
      this.operations = operationsBefore;
      throw error;
    }
  }
}

type RegularEntitlement = Readonly<Record<"N" | "N1" | "N2", number>>;
export const entitlementCapCases: readonly {
  label: string;
  granted: RegularEntitlement;
  committed: Partial<RegularEntitlement>;
  reserved: Partial<RegularEntitlement>;
}[] = [
  {
    label: "N1 granted 7 with committed 2 and available 5",
    granted: { N: 12, N1: 7, N2: 3 },
    committed: { N1: 2 },
    reserved: {},
  },
  {
    label: "N2 granted 7 with reserved 2 and available 5",
    granted: { N: 12, N1: 2, N2: 7 },
    committed: {},
    reserved: { N2: 2 },
  },
  {
    label: "N granted 13 with committed 1 and available 12",
    granted: { N: 13, N1: 2, N2: 3 },
    committed: { N: 1 },
    reserved: {},
  },
  {
    label: "regular granted 25 with committed 2 and available 23",
    granted: { N: 13, N1: 6, N2: 6 },
    committed: { N: 2 },
    reserved: {},
  },
];

export function withRegularEntitlement(
  accounts: readonly AnnualBalanceAccountState[],
  granted: RegularEntitlement,
  committed: Partial<RegularEntitlement> = {},
  reserved: Partial<RegularEntitlement> = {},
): AnnualBalanceAccountState[] {
  return accounts.map((account) => {
    if (account.bucket === "JOINT_LEAVE_CLAIM") return account;
    const grantedDays = granted[account.bucket];
    const committedDays = committed[account.bucket] ?? 0;
    const reservedDays = reserved[account.bucket] ?? 0;
    return {
      ...account,
      grantedDays,
      committedDays,
      reservedDays,
      availableDays: grantedDays - committedDays - reservedDays,
    };
  });
}
