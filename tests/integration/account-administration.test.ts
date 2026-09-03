import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AccountAdministrationService } from "@/application/accounts/service";
import { PrismaAccountAdministrationRepository } from "@/infrastructure/accounts/prisma-account-administration-repository";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
import { verifyPassword } from "@/modules/auth/password";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  describe.skip("Account administration persistence", () => {
    it("requires DATABASE_URL", () => undefined);
  });
} else {
  describe("Account administration persistence", () => {
    const database = createDatabaseClient();
    const accounts = new AccountAdministrationService(
      new PrismaAccountAdministrationRepository(database),
    );
    const authentication = new AuthenticationService(
      new PrismaAuthRepository(database),
    );
    const marker = randomUUID().slice(0, 8);
    const ids: string[] = [];

    async function employee(suffix: string) {
      const row = await database.employee.create({
        data: {
          nip: `ACC-${marker}-${suffix}`,
          fullName: `Pegawai Uji ${suffix}`,
          positionTitle: "Jabatan Uji",
          workUnit: "Unit Uji",
        },
      });
      ids.push(row.id);
      return row;
    }

    afterAll(async () => {
      await database.session.deleteMany({
        where: {
          authenticationIdentity: { user: { employeeId: { in: ids } } },
        },
      });
      await database.localCredential.deleteMany({
        where: {
          authenticationIdentity: { user: { employeeId: { in: ids } } },
        },
      });
      await database.authenticationIdentity.deleteMany({
        where: { user: { employeeId: { in: ids } } },
      });
      await database.user.deleteMany({ where: { employeeId: { in: ids } } });
      await database.employee.deleteMany({ where: { id: { in: ids } } });
      await database.$disconnect();
    });

    it("atomically provisions User, LOCAL identity, and credential linked to Employee", async () => {
      const row = await employee("OK");
      const result = await accounts.provision(row.id, {
        role: "ADMIN_KEPEGAWAIAN",
        password: "awal",
      });
      expect(result).toEqual({
        employeeId: row.id,
        username: row.nip,
        role: "ADMIN_KEPEGAWAIAN",
        isActive: true,
      });
      const persisted = await database.user.findUnique({
        where: { employeeId: row.id },
        include: {
          authenticationIdentities: { include: { localCredential: true } },
        },
      });
      expect(persisted?.employeeId).toBe(row.id);
      expect(persisted?.role).toBe("ADMIN_KEPEGAWAIAN");
      expect(persisted?.authenticationIdentities).toHaveLength(1);
      const identity = persisted!.authenticationIdentities[0]!;
      expect(identity.provider).toBe("LOCAL");
      expect(identity.providerSubject).toBe(row.nip);
      expect(identity.localCredential?.passwordHash).not.toBe("awal");
      expect(
        await verifyPassword("awal", identity.localCredential!.passwordHash),
      ).toBe(true);
    });

    it("rolls back User when a later identity constraint fails", async () => {
      const owner = await employee("OWNER");
      const target = await employee("ROLLBACK");
      const ownerUser = await database.user.create({
        data: { employeeId: owner.id, role: "PEGAWAI" },
      });
      await database.authenticationIdentity.create({
        data: {
          userId: ownerUser.id,
          provider: "LOCAL",
          providerSubject: target.nip,
        },
      });
      await expect(
        accounts.provision(target.id, { role: "PEGAWAI", password: "x" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        await database.user.findUnique({ where: { employeeId: target.id } }),
      ).toBeNull();
      expect(
        await database.employee.findUnique({ where: { id: target.id } }),
      ).not.toBeNull();
    });

    it("persists role, account lifecycle, and password reset while preserving Employee", async () => {
      const row = await employee("LIFE");
      await accounts.provision(row.id, { role: "PEGAWAI", password: "lama" });
      expect((await authentication.login(row.nip, "lama")).principal.role).toBe(
        "PEGAWAI",
      );
      expect(
        (await accounts.update(row.id, { role: "ADMIN_KEPEGAWAIAN" })).role,
      ).toBe("ADMIN_KEPEGAWAIAN");
      await accounts.update(row.id, { isActive: false });
      await expect(authentication.login(row.nip, "lama")).rejects.toThrow();
      expect(
        await database.employee.findUnique({ where: { id: row.id } }),
      ).toMatchObject({ isActive: true });
      await accounts.update(row.id, { isActive: true });
      expect((await authentication.login(row.nip, "lama")).principal.role).toBe(
        "ADMIN_KEPEGAWAIAN",
      );

      const before = await database.localCredential.findFirst({
        where: { authenticationIdentity: { user: { employeeId: row.id } } },
      });
      const changedAt = new Date(Date.now() + 1000);
      await accounts.resetPassword(row.id, "baru", changedAt);
      const after = await database.localCredential.findFirst({
        where: { authenticationIdentity: { user: { employeeId: row.id } } },
      });
      expect(after?.passwordHash).not.toBe(before?.passwordHash);
      expect(after?.passwordChangedAt).toEqual(changedAt);
      await expect(authentication.login(row.nip, "lama")).rejects.toThrow();
      await expect(authentication.login(row.nip, "baru")).resolves.toBeTruthy();
    });

    it("returns safe NOT_FOUND for a missing Employee/account", async () => {
      await expect(
        accounts.findByEmployeeId(randomUUID()),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        accounts.resetPassword(randomUUID(), "x"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
}
