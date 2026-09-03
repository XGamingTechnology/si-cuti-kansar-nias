import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  EmployeeError,
  type EmployeeRepository,
  type EmployeeWrite,
} from "@/application/employees/service";

const select = {
  id: true,
  nip: true,
  fullName: true,
  positionTitle: true,
  workUnit: true,
  isActive: true,
  directSupervisorId: true,
} as const;

export class PrismaEmployeeRepository implements EmployeeRepository {
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
