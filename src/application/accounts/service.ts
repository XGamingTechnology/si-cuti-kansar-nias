import { hashPassword } from "@/modules/auth/password";
import {
  APPLICATION_ROLES,
  type ApplicationRole,
} from "@/application/authorization/policy";

export type AccountStatus = Readonly<{
  employeeId: string;
  username: string;
  role: ApplicationRole;
  isActive: boolean;
}>;

export interface AccountAdministrationRepository {
  findByEmployeeId(employeeId: string): Promise<AccountStatus | null>;
  provision(
    employeeId: string,
    role: ApplicationRole,
    passwordHash: string,
  ): Promise<AccountStatus>;
  updateRole(employeeId: string, role: ApplicationRole): Promise<AccountStatus>;
  updateActive(employeeId: string, isActive: boolean): Promise<AccountStatus>;
  resetLocalPassword(
    employeeId: string,
    passwordHash: string,
    changedAt: Date,
  ): Promise<AccountStatus>;
}

export type AccountErrorCode = "VALIDATION" | "CONFLICT" | "NOT_FOUND";
export class AccountAdministrationError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountAdministrationError";
  }
}

function approvedRole(value: unknown): ApplicationRole {
  if (
    typeof value !== "string" ||
    !APPLICATION_ROLES.includes(value as ApplicationRole)
  )
    throw new AccountAdministrationError(
      "VALIDATION",
      "Role akun tidak valid.",
    );
  return value as ApplicationRole;
}

function validPassword(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024)
    throw new AccountAdministrationError(
      "VALIDATION",
      "Kata sandi wajib diisi dan maksimal 1024 karakter.",
    );
  return value;
}

export class AccountAdministrationService {
  constructor(private readonly repository: AccountAdministrationRepository) {}

  async findByEmployeeId(employeeId: string): Promise<AccountStatus | null> {
    return this.repository.findByEmployeeId(employeeId);
  }

  async provision(
    employeeId: string,
    input: Readonly<{ role: unknown; password: unknown }>,
  ): Promise<AccountStatus> {
    const role = approvedRole(input.role);
    const password = validPassword(input.password);
    if (await this.repository.findByEmployeeId(employeeId))
      throw new AccountAdministrationError(
        "CONFLICT",
        "Pegawai sudah memiliki akun.",
      );
    return this.repository.provision(
      employeeId,
      role,
      await hashPassword(password),
    );
  }

  async update(
    employeeId: string,
    input: Readonly<{ role?: unknown; isActive?: unknown }>,
  ): Promise<AccountStatus> {
    const hasRole = input.role !== undefined;
    const hasStatus = input.isActive !== undefined;
    if (hasRole === hasStatus)
      throw new AccountAdministrationError(
        "VALIDATION",
        "Pilih tepat satu perubahan role atau status akun.",
      );
    if (hasRole)
      return this.repository.updateRole(employeeId, approvedRole(input.role));
    if (typeof input.isActive !== "boolean")
      throw new AccountAdministrationError(
        "VALIDATION",
        "Status akun tidak valid.",
      );
    return this.repository.updateActive(employeeId, input.isActive);
  }

  async resetPassword(
    employeeId: string,
    password: unknown,
    changedAt = new Date(),
  ): Promise<AccountStatus> {
    const passwordHash = await hashPassword(validPassword(password));
    return this.repository.resetLocalPassword(
      employeeId,
      passwordHash,
      changedAt,
    );
  }
}
