import { randomUUID } from "node:crypto";
import type {
  EmployeeMutation,
  EmployeeImportMutation,
} from "@/application/employees/mutation";
import {
  administrationAudit,
  checkEmployeeVersion,
} from "./administration-audit";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  EmployeeError,
  type EmployeeRepository,
  type EmployeeWrite,
} from "@/application/employees/service";
import type {
  EmployeeImportRepository,
  EmployeeImportRow,
} from "@/application/employees/import-service";
import { LAST_LOGIN_CAPABLE_ADMIN_MESSAGE } from "@/application/authentication/admin-lifecycle";
import {
  countLoginCapableAdmins,
  isLoginCapableAdmin,
  lockAdminLifecycle,
} from "@/infrastructure/auth/admin-lifecycle-guard";

const select = {
  id: true,
  updatedAt: true,
  nip: true,
  fullName: true,
  positionTitle: true,
  workUnit: true,
  isActive: true,
  directSupervisorId: true,
  employmentStartDate: true,
} as const;

function employeeData(input: EmployeeWrite) {
  return {
    ...input,
    employmentStartDate: input.employmentStartDate
      ? input.employmentStartDate instanceof Date
        ? input.employmentStartDate
        : new Date(`${input.employmentStartDate}T00:00:00.000Z`)
      : null,
  };
}

export class PrismaEmployeeRepository
  implements EmployeeRepository, EmployeeImportRepository
{
  constructor(private readonly database: PrismaClient) {}
  list() {
    return this.database.employee.findMany({
      select,
      orderBy: { fullName: "asc" },
    });
  }
  findById(id: string) {
    return this.database.employee.findUnique({ where: { id }, select });
  }
  findByNip(nip: string) {
    return this.database.employee.findUnique({ where: { nip }, select });
  }
  async findExistingNips(nips: readonly string[]) {
    if (!nips.length) return [];
    const rows = await this.database.employee.findMany({
      where: { nip: { in: [...nips] } },
      select: { nip: true },
    });
    return rows.map((row) => row.nip);
  }
  async replayImport(mutation: EmployeeImportMutation) {
    const prior = await this.database.employeeAdministrationEvent.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: mutation.actorUserId,
          idempotencyKey: mutation.idempotencyKey,
        },
      },
    });
    if (!prior) return null;
    if (
      prior.requestHash !== mutation.requestHash ||
      prior.action !== "EMPLOYEE_IMPORT"
    )
      throw new EmployeeError(
        "CONFLICT",
        "Kunci impor sudah digunakan untuk file lain.",
      );
    return this.database.employee.findMany({
      where: { id: { in: prior.employeeIds } },
      select,
    });
  }
  async importAll(
    rows: readonly Omit<EmployeeImportRow, "rowNumber">[],
    mutation?: EmployeeImportMutation,
  ) {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          await lockAdminLifecycle(transaction);
          if (mutation) {
            const prior =
              await transaction.employeeAdministrationEvent.findUnique({
                where: {
                  actorUserId_idempotencyKey: {
                    actorUserId: mutation.actorUserId,
                    idempotencyKey: mutation.idempotencyKey,
                  },
                },
              });
            if (prior) {
              if (prior.requestHash !== mutation.requestHash)
                throw new EmployeeError(
                  "CONFLICT",
                  "Kunci impor sudah digunakan untuk file lain.",
                );
              return transaction.employee.findMany({
                where: { id: { in: prior.employeeIds } },
                select,
              });
            }
          }
          const existing = await transaction.employee.findFirst({
            where: { nip: { in: rows.map((row) => row.nip) } },
            select: { nip: true },
          });
          if (existing)
            throw new EmployeeError(
              "CONFLICT",
              `NIP ${existing.nip} sudah terdaftar.`,
            );
          const created = [];
          for (const row of rows)
            created.push(
              await transaction.employee.create({
                data: { ...row, directSupervisorId: null },
                select,
              }),
            );
          if (mutation)
            await transaction.employeeAdministrationEvent.create({
              data: {
                id: randomUUID(),
                actorUserId: mutation.actorUserId,
                action: "EMPLOYEE_IMPORT",
                changedFields: [],
                employeeIds: created.map((row) => row.id),
                idempotencyKey: mutation.idempotencyKey,
                requestHash: mutation.requestHash,
              },
            });
          return created;
        },
        { timeout: 30000 },
      );
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async create(input: EmployeeWrite, mutation?: EmployeeMutation) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const employee = await transaction.employee.create({
          data: employeeData(input),
          select,
        });
        await administrationAudit(
          transaction,
          mutation,
          "EMPLOYEE_CREATE",
          employee.id,
          Object.keys(input),
        );
        return employee;
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async updateWithLocalIdentity(
    employeeId: string,
    input: EmployeeWrite,
    mutation?: EmployeeMutation,
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        await lockAdminLifecycle(transaction);
        await checkEmployeeVersion(transaction, employeeId, mutation);
        const employee = await transaction.employee.update({
          where: { id: employeeId },
          data: {
            ...employeeData(input),
            ...(mutation?.expectedUpdatedAt
              ? {
                  updatedAt: new Date(
                    Math.max(
                      Date.now(),
                      Date.parse(mutation.expectedUpdatedAt) + 1,
                    ),
                  ),
                }
              : {}),
          },
          select,
        });
        await transaction.authenticationIdentity.updateMany({
          where: { provider: "LOCAL", user: { employeeId } },
          data: { providerSubject: input.nip },
        });
        await administrationAudit(
          transaction,
          mutation,
          "EMPLOYEE_UPDATE",
          employee.id,
          Object.keys(input),
        );
        return employee;
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async setActive(
    employeeId: string,
    isActive: boolean,
    mutation?: EmployeeMutation,
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        await lockAdminLifecycle(transaction);
        if (
          !isActive &&
          (await isLoginCapableAdmin(transaction, employeeId)) &&
          (await countLoginCapableAdmins(transaction)) <= 1
        )
          throw new EmployeeError(
            "INVARIANT",
            LAST_LOGIN_CAPABLE_ADMIN_MESSAGE,
          );
        await checkEmployeeVersion(transaction, employeeId, mutation);
        // Revocation is permanent: reactivation must never revive pre-deactivation sessions.
        if (!isActive)
          await transaction.session.updateMany({
            where: {
              authenticationIdentity: { user: { employeeId } },
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        const employee = await transaction.employee.update({
          where: { id: employeeId },
          data: {
            isActive,
            ...(mutation?.expectedUpdatedAt
              ? {
                  updatedAt: new Date(
                    Math.max(
                      Date.now(),
                      Date.parse(mutation.expectedUpdatedAt) + 1,
                    ),
                  ),
                }
              : {}),
          },
          select,
        });
        await administrationAudit(
          transaction,
          mutation,
          isActive ? "EMPLOYEE_ACTIVATE" : "EMPLOYEE_DEACTIVATE",
          employeeId,
          ["isActive"],
        );
        return employee;
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  private safeError(error: unknown): Error {
    if (error instanceof EmployeeError) return error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return new EmployeeError("CONFLICT", "NIP sudah digunakan.");
      if (error.code === "P2025")
        return new EmployeeError("NOT_FOUND", "Pegawai tidak ditemukan.");
      if (error.code === "P2003")
        return new EmployeeError(
          "VALIDATION",
          "Atasan langsung tidak ditemukan.",
        );
    }
    return error instanceof Error
      ? error
      : new Error("Operasi data pegawai gagal.");
  }
}
