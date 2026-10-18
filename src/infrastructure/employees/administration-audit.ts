import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmployeeMutation } from "@/application/employees/mutation";
import { EmployeeError } from "@/application/employees/service";
export type AdministrationTransaction = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];
export async function administrationAudit(
  tx: AdministrationTransaction,
  mutation: EmployeeMutation | undefined,
  action: string,
  targetEmployeeId: string,
  changedFields: string[] = [],
) {
  if (!mutation) return; // Internal legacy callers, never supplied by an HTTP payload.
  await tx.employeeAdministrationEvent.create({
    data: {
      id: randomUUID(),
      actorUserId: mutation.actorUserId,
      targetEmployeeId,
      action,
      changedFields,
      employeeIds: [],
    },
  });
}
export async function checkEmployeeVersion(
  tx: AdministrationTransaction,
  id: string,
  mutation?: EmployeeMutation,
) {
  if (!mutation?.expectedUpdatedAt) return;
  const row = await tx.employee.findUnique({
    where: { id },
    select: { updatedAt: true },
  });
  if (!row || row.updatedAt.toISOString() !== mutation.expectedUpdatedAt)
    throw new EmployeeError(
      "CONFLICT",
      "Data pegawai telah berubah. Muat ulang sebelum menyimpan lagi.",
    );
}
