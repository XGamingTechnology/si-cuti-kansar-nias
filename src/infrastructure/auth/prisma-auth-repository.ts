import type { PrismaClient } from "@/generated/prisma/client";
import type { AuthRepository } from "@/modules/auth/service";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: PrismaClient) {}

  async findLocalIdentity(nip: string) {
    const identity = await this.database.authenticationIdentity.findFirst({
      where: { provider: "LOCAL", providerSubject: nip },
      include: { localCredential: true, user: { include: { employee: true } } },
    });
    if (!identity?.localCredential) return null;
    return {
      identityId: identity.id,
      userId: identity.user.id,
      employeeId: identity.user.employee.id,
      fullName: identity.user.employee.fullName,
      role: identity.user.role,
      passwordHash: identity.localCredential.passwordHash,
      employeeActive: identity.user.employee.isActive,
      userActive: identity.user.isActive,
      identityActive: identity.isActive,
    };
  }

  async createSession(identityId: string, tokenHash: string, expiresAt: Date, now: Date) {
    await this.database.$transaction([
      this.database.session.create({ data: { authenticationIdentityId: identityId, tokenHash, expiresAt } }),
      this.database.authenticationIdentity.update({ where: { id: identityId }, data: { lastLoginAt: now } }),
    ]);
  }

  async findSession(tokenHash: string) {
    const session = await this.database.session.findUnique({
      where: { tokenHash },
      include: { authenticationIdentity: { include: { user: { include: { employee: true } } } } },
    });
    if (!session) return null;
    const identity = session.authenticationIdentity;
    return {
      userId: identity.user.id,
      employeeId: identity.user.employee.id,
      fullName: identity.user.employee.fullName,
      role: identity.user.role,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      employeeActive: identity.user.employee.isActive,
      userActive: identity.user.isActive,
      identityActive: identity.isActive,
    };
  }

  async revokeSession(tokenHash: string, now: Date) {
    await this.database.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: now } });
  }
}
