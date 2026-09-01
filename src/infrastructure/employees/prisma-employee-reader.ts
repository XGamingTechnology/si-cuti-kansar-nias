import type { PrismaClient } from "@/generated/prisma/client";

export type EmployeeProfile = Readonly<{
  id: string;
  nip: string;
  fullName: string;
  positionTitle: string;
  workUnit: string;
  isActive: boolean;
}>;

export interface EmployeeReader {
  findById(id: string): Promise<EmployeeProfile | null>;
}

export class PrismaEmployeeReader implements EmployeeReader {
  constructor(private readonly database: PrismaClient) {}

  findById(id: string) {
    return this.database.employee.findUnique({
      where: { id },
      select: {
        id: true,
        nip: true,
        fullName: true,
        positionTitle: true,
        workUnit: true,
        isActive: true,
      },
    });
  }
}
