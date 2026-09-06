import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { ADMIN_LIFECYCLE_ADVISORY_LOCK_KEY } from "@/application/authentication/admin-lifecycle";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function lockAdminLifecycle(transaction: Transaction) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${ADMIN_LIFECYCLE_ADVISORY_LOCK_KEY}::bigint)`,
  );
}

export async function isLoginCapableAdmin(
  transaction: Transaction,
  employeeId: string,
) {
  return Boolean(
    await transaction.user.findFirst({
      where: {
        employeeId,
        role: "ADMIN_KEPEGAWAIAN",
        isActive: true,
        employee: { isActive: true },
        authenticationIdentities: {
          some: {
            provider: "LOCAL",
            isActive: true,
            localCredential: { isNot: null },
          },
        },
      },
      select: { id: true },
    }),
  );
}

export async function countLoginCapableAdmins(transaction: Transaction) {
  return transaction.user.count({
    where: {
      role: "ADMIN_KEPEGAWAIAN",
      isActive: true,
      employee: { isActive: true },
      authenticationIdentities: {
        some: {
          provider: "LOCAL",
          isActive: true,
          localCredential: { isNot: null },
        },
      },
    },
  });
}
