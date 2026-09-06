import { Prisma } from "../../generated/prisma/client.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import {
  AuthenticationRecoveryError,
  type AuthenticationRecoveryRepository,
} from "../../application/authentication/recovery.ts";

const missingAccountMessage =
  "Pegawai ditemukan, tetapi akun LOCAL lengkap tidak tersedia. Lakukan provisioning akun melalui Admin normal.";

export class PrismaAuthenticationRecoveryRepository implements AuthenticationRecoveryRepository {
  private readonly database: PrismaClient;

  constructor(database: PrismaClient) {
    this.database = database;
  }

  async inspect(nip: string) {
    const employee = await this.database.employee.findUnique({
      where: { nip },
      select: {
        nip: true,
        fullName: true,
        user: {
          select: {
            authenticationIdentities: {
              where: { provider: "LOCAL" },
              select: {
                id: true,
                localCredential: { select: { authenticationIdentityId: true } },
              },
            },
          },
        },
      },
    });
    if (!employee)
      throw new AuthenticationRecoveryError(
        "Pegawai dengan NIP tersebut tidak ditemukan.",
      );
    if (!employee.user?.authenticationIdentities[0]?.localCredential)
      throw new AuthenticationRecoveryError(missingAccountMessage);
    return { nip: employee.nip, fullName: employee.fullName };
  }

  async recover(nip: string, passwordHash: string, changedAt: Date) {
    try {
      await this.database.$transaction(async (transaction) => {
        const employee = await transaction.employee.findUnique({
          where: { nip },
          select: {
            id: true,
            user: {
              select: {
                id: true,
                authenticationIdentities: {
                  where: { provider: "LOCAL" },
                  select: {
                    id: true,
                    localCredential: {
                      select: { authenticationIdentityId: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!employee)
          throw new AuthenticationRecoveryError(
            "Pegawai dengan NIP tersebut tidak ditemukan.",
          );
        const identity = employee.user?.authenticationIdentities[0];
        if (!identity?.localCredential)
          throw new AuthenticationRecoveryError(missingAccountMessage);

        await transaction.employee.update({
          where: { id: employee.id },
          data: { isActive: true },
        });
        await transaction.user.update({
          where: { id: employee.user!.id },
          data: { isActive: true, role: "ADMIN_KEPEGAWAIAN" },
        });
        await transaction.authenticationIdentity.update({
          where: { id: identity.id },
          data: { isActive: true },
        });
        await transaction.localCredential.update({
          where: { authenticationIdentityId: identity.id },
          data: { passwordHash, passwordChangedAt: changedAt },
        });
        await transaction.session.updateMany({
          where: { authenticationIdentityId: identity.id, revokedAt: null },
          data: { revokedAt: changedAt },
        });
      });
    } catch (error) {
      if (error instanceof AuthenticationRecoveryError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        throw new AuthenticationRecoveryError(missingAccountMessage);
      throw new AuthenticationRecoveryError(
        "Pemulihan akun gagal dengan aman; tidak ada perubahan yang disimpan.",
      );
    }
  }
}
