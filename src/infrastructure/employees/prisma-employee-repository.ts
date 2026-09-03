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

const select = {
  id: true,
  nip: true,
  fullName: true,
  positionTitle: true,
  workUnit: true,
  isActive: true,
  directSupervisorId: true,
} as const;

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
  async importAll(rows: readonly Omit<EmployeeImportRow, "rowNumber">[]) {
    try {
      return await this.database.$transaction(async (transaction) => {
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
        return created;
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async create(input: EmployeeWrite) {
    try {
      return await this.database.employee.create({ data: input, select });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async updateWithLocalIdentity(employeeId: string, input: EmployeeWrite) {
    try {
      return await this.database.$transaction(async (transaction) => {
        const employee = await transaction.employee.update({
          where: { id: employeeId },
          data: input,
          select,
        });
        await transaction.authenticationIdentity.updateMany({
          where: { provider: "LOCAL", user: { employeeId } },
          data: { providerSubject: input.nip },
        });
        return employee;
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  async setActive(employeeId: string, isActive: boolean) {
    try {
      return await this.database.employee.update({
        where: { id: employeeId },
        data: { isActive },
        select,
      });
    } catch (error) {
      throw this.safeError(error);
    }
  }
  private safeError(error: unknown): Error {
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
