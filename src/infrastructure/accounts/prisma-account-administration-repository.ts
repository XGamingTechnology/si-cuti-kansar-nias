import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  AccountAdministrationError,
  type AccountAdministrationRepository,
} from "@/application/accounts/service";
import type { ApplicationRole } from "@/application/authorization/policy";

const accountSelect = {
  employeeId: true,
  role: true,
  isActive: true,
  employee: { select: { nip: true } },
} as const;

function account(row: {
  employeeId: string;
  role: ApplicationRole;
  isActive: boolean;
  employee: { nip: string };
}) {
  return {
    employeeId: row.employeeId,
    username: row.employee.nip,
    role: row.role,
    isActive: row.isActive,
  };
}

export class PrismaAccountAdministrationRepository implements AccountAdministrationRepository {
  constructor(private readonly database: PrismaClient) {}

  async findByEmployeeId(employeeId: string) {
    const row = await this.database.user.findUnique({
      where: { employeeId },
      select: accountSelect,
    });
    if (row) return account(row);
    const employee = await this.database.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee)
      throw new AccountAdministrationError(
        "NOT_FOUND",
        "Pegawai tidak ditemukan.",
      );
    return null;
  }

  async provision(
    employeeId: string,
    role: ApplicationRole,
    passwordHash: string,
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const employee = await transaction.employee.findUnique({
          where: { id: employeeId },
          select: { nip: true },
        });
        if (!employee)
          throw new AccountAdministrationError(
            "NOT_FOUND",
            "Pegawai tidak ditemukan.",
          );
        const row = await transaction.user.create({
          data: {
            employeeId,
            role,
            authenticationIdentities: {
              create: {
                provider: "LOCAL",
                providerSubject: employee.nip,
                localCredential: { create: { passwordHash } },
              },
            },
          },
          select: accountSelect,
        });
        return account(row);
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }

  async updateRole(employeeId: string, role: ApplicationRole) {
    try {
      return account(
        await this.database.user.update({
          where: { employeeId },
          data: { role },
          select: accountSelect,
        }),
      );
    } catch (error) {
      throw this.safeError(error);
    }
  }

  async updateActive(employeeId: string, isActive: boolean) {
    try {
      return account(
        await this.database.user.update({
          where: { employeeId },
          data: { isActive },
          select: accountSelect,
        }),
      );
    } catch (error) {
      throw this.safeError(error);
    }
  }

  async resetLocalPassword(
    employeeId: string,
    passwordHash: string,
    changedAt: Date,
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const identity = await transaction.authenticationIdentity.findFirst({
          where: { provider: "LOCAL", user: { employeeId } },
          select: { id: true },
        });
        if (!identity)
          throw new AccountAdministrationError(
            "NOT_FOUND",
            "Akun LOCAL tidak ditemukan.",
          );
        await transaction.localCredential.update({
          where: { authenticationIdentityId: identity.id },
          data: { passwordHash, passwordChangedAt: changedAt },
        });
        const row = await transaction.user.findUnique({
          where: { employeeId },
          select: accountSelect,
        });
        if (!row)
          throw new AccountAdministrationError(
            "NOT_FOUND",
            "Akun tidak ditemukan.",
          );
        return account(row);
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }

  private safeError(error: unknown): Error {
    if (error instanceof AccountAdministrationError) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return new AccountAdministrationError(
          "CONFLICT",
          "Pegawai sudah memiliki akun.",
        );
      if (error.code === "P2025")
        return new AccountAdministrationError(
          "NOT_FOUND",
          "Akun LOCAL tidak ditemukan.",
        );
    }
    return error instanceof Error ? error : new Error("Operasi akun gagal.");
  }
}
