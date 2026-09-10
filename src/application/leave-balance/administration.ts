import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
  type AnnualBalanceBucket,
} from "@/domain/leave-balance";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceOperationRecord,
  AppendBalanceOperation,
} from "./ports";

export const OPENING_BALANCE_REASON_MAX_LENGTH = 1000;

export type AnnualBalanceEmployee = Readonly<{
  id: string;
  nip: string;
  fullName: string;
  isActive: boolean;
}>;

export type AnnualBalanceReadiness =
  | "UNINITIALIZED"
  | "INITIALIZED"
  | "PARTIAL";

export type AnnualBalanceAdministrationDetail = Readonly<{
  employeeId: string;
  nip: string;
  fullName: string;
  entitlementYear: number;
  readiness: AnnualBalanceReadiness;
  isInitialized: boolean;
  balances: Record<AnnualBalanceBucket, AnnualBalanceAccountState | null>;
  regularAvailableDays: number;
  history: readonly AnnualBalanceOperationRecord[];
}>;

export interface LockedOpeningBalanceTransaction {
  readonly employee: AnnualBalanceEmployee | null;
  readonly accounts: readonly AnnualBalanceAccountState[];
  createAccount(
    input: Readonly<{
      employeeId: string;
      entitlementYear: number;
      bucket: AnnualBalanceBucket;
      grantedDays: number;
    }>,
  ): Promise<AnnualBalanceAccountState>;
  append(input: AppendBalanceOperation): Promise<AnnualBalanceOperationRecord>;
}

export interface AnnualBalanceAdministrationRepository {
  listActiveEmployees(): Promise<readonly AnnualBalanceEmployee[]>;
  findEmployee(employeeId: string): Promise<AnnualBalanceEmployee | null>;
  findAccounts(
    employeeId: string,
    entitlementYear: number,
  ): Promise<readonly AnnualBalanceAccountState[]>;
  findHistory(
    employeeId: string,
    entitlementYear: number,
  ): Promise<readonly AnnualBalanceOperationRecord[]>;
  withLockedEmployee<T>(
    employeeId: string,
    entitlementYear: number,
    work: (transaction: LockedOpeningBalanceTransaction) => Promise<T>,
  ): Promise<T>;
}

export class OpeningBalancePersistenceConflict extends Error {
  constructor() {
    super("Concurrent opening balance initialization conflict");
    this.name = "OpeningBalancePersistenceConflict";
  }
}

export type AnnualBalanceAdministrationErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INACTIVE_EMPLOYEE"
  | "ALREADY_INITIALIZED"
  | "PARTIAL_BALANCE"
  | "CONCURRENT_CONFLICT";

export class AnnualBalanceAdministrationError extends Error {
  constructor(
    public readonly code: AnnualBalanceAdministrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnnualBalanceAdministrationError";
  }
}

const emptyBalances = (): Record<
  AnnualBalanceBucket,
  AnnualBalanceAccountState | null
> => ({
  N: null,
  N1: null,
  N2: null,
  JOINT_LEAVE_CLAIM: null,
});

function requireText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      `${label} wajib diisi dan maksimal ${max} karakter.`,
    );
  }
  return trimmed;
}

function requireYear(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 9999) {
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      "Tahun saldo tidak valid.",
    );
  }
  return value;
}

function requireOpeningDays(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 6) {
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      `${label} harus berupa bilangan bulat antara 0 dan 6.`,
    );
  }
  return value;
}

function detail(
  employee: AnnualBalanceEmployee,
  year: number,
  accounts: readonly AnnualBalanceAccountState[],
  history: readonly AnnualBalanceOperationRecord[] = [],
): AnnualBalanceAdministrationDetail {
  const balances = emptyBalances();
  for (const account of accounts) balances[account.bucket] = account;
  const readiness: AnnualBalanceReadiness =
    accounts.length === 0
      ? "UNINITIALIZED"
      : accounts.length === 4 &&
          ANNUAL_BALANCE_BUCKET_PRIORITY.every((bucket) => balances[bucket])
        ? "INITIALIZED"
        : "PARTIAL";
  return {
    employeeId: employee.id,
    nip: employee.nip,
    fullName: employee.fullName,
    entitlementYear: year,
    readiness,
    isInitialized: readiness === "INITIALIZED",
    balances,
    regularAvailableDays:
      (balances.N?.availableDays ?? 0) +
      (balances.N1?.availableDays ?? 0) +
      (balances.N2?.availableDays ?? 0),
    history,
  };
}

export type InitializeOpeningBalanceInput = Readonly<{
  employeeId: string;
  entitlementYear: number;
  n1Days: number;
  n2Days: number;
  reason: string;
  idempotencyKey: string;
  actorUserId: string;
  occurredAt?: Date;
}>;

export class AnnualBalanceAdministrationService {
  constructor(
    private readonly repository: AnnualBalanceAdministrationRepository,
  ) {}

  async list(
    entitlementYear: number,
  ): Promise<readonly AnnualBalanceAdministrationDetail[]> {
    const year = requireYear(entitlementYear);
    const employees = await this.repository.listActiveEmployees();
    return Promise.all(
      employees.map(async (employee) =>
        detail(
          employee,
          year,
          await this.repository.findAccounts(employee.id, year),
        ),
      ),
    );
  }

  async get(
    employeeId: string,
    entitlementYear: number,
  ): Promise<AnnualBalanceAdministrationDetail> {
    const id = requireText(employeeId, "ID pegawai", 191);
    const year = requireYear(entitlementYear);
    const employee = await this.repository.findEmployee(id);
    if (!employee)
      throw new AnnualBalanceAdministrationError(
        "NOT_FOUND",
        "Pegawai tidak ditemukan.",
      );
    return detail(
      employee,
      year,
      await this.repository.findAccounts(id, year),
      await this.repository.findHistory(id, year),
    );
  }

  async initialize(
    input: InitializeOpeningBalanceInput,
  ): Promise<AnnualBalanceAdministrationDetail> {
    const employeeId = requireText(input.employeeId, "ID pegawai", 191);
    const year = requireYear(input.entitlementYear);
    const n1Days = requireOpeningDays(input.n1Days, "Saldo N-1");
    const n2Days = requireOpeningDays(input.n2Days, "Saldo N-2");
    const reason = requireText(
      input.reason,
      "Dasar administrasi",
      OPENING_BALANCE_REASON_MAX_LENGTH,
    );
    const key = requireText(input.idempotencyKey, "Idempotency key", 150);
    requireText(input.actorUserId, "Identitas Admin", 191);
    if (12 + n1Days + n2Days > 24)
      throw new AnnualBalanceAdministrationError(
        "VALIDATION",
        "Total saldo awal reguler tidak boleh melebihi 24 hari.",
      );
    const grants: Readonly<Record<AnnualBalanceBucket, number>> = {
      JOINT_LEAVE_CLAIM: 0,
      N2: n2Days,
      N1: n1Days,
      N: 12,
    };
    const referenceId = `opening-balance:${employeeId}:${year}`;
    const occurredAt = input.occurredAt ?? new Date();
    try {
      return await this.repository.withLockedEmployee(
        employeeId,
        year,
        async (transaction) => {
          if (!transaction.employee)
            throw new AnnualBalanceAdministrationError(
              "NOT_FOUND",
              "Pegawai tidak ditemukan.",
            );
          if (!transaction.employee.isActive)
            throw new AnnualBalanceAdministrationError(
              "INACTIVE_EMPLOYEE",
              "Saldo awal hanya dapat diinisialisasi untuk pegawai aktif.",
            );
          if (transaction.accounts.length === 4)
            throw new AnnualBalanceAdministrationError(
              "ALREADY_INITIALIZED",
              "Saldo cuti tahun tersebut sudah diinisialisasi.",
            );
          if (transaction.accounts.length !== 0)
            throw new AnnualBalanceAdministrationError(
              "PARTIAL_BALANCE",
              "Data saldo tahun tersebut tidak lengkap. Hubungi pengelola sistem.",
            );
          const accounts: AnnualBalanceAccountState[] = [];
          const operations: AnnualBalanceOperationRecord[] = [];
          for (const bucket of ANNUAL_BALANCE_BUCKET_PRIORITY) {
            const grantedDays = grants[bucket];
            accounts.push(
              await transaction.createAccount({
                employeeId,
                entitlementYear: year,
                bucket,
                grantedDays,
              }),
            );
            if (grantedDays > 0)
              operations.push(
                await transaction.append({
                  employeeId,
                  entitlementYear: year,
                  bucket,
                  operationType: "GRANT",
                  days: grantedDays,
                  occurredAt,
                  idempotencyKey: `${key}:${bucket}`,
                  referenceType: "OPENING_BALANCE",
                  referenceId,
                  reason,
                }),
              );
          }
          return detail(transaction.employee, year, accounts, operations);
        },
      );
    } catch (error) {
      if (error instanceof OpeningBalancePersistenceConflict)
        throw new AnnualBalanceAdministrationError(
          "CONCURRENT_CONFLICT",
          "Saldo cuti telah diinisialisasi oleh permintaan lain.",
        );
      throw error;
    }
  }
}
