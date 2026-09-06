import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountAdministrationService } from "@/application/accounts/service";
import { EmployeeService } from "@/application/employees/service";
import { AuthenticationRecoveryService } from "@/application/authentication/recovery";
import { LAST_LOGIN_CAPABLE_ADMIN_MESSAGE } from "@/application/authentication/admin-lifecycle";
import { PrismaAccountAdministrationRepository } from "@/infrastructure/accounts/prisma-account-administration-repository";
import { PrismaEmployeeRepository } from "@/infrastructure/employees/prisma-employee-repository";
import { PrismaAuthenticationRecoveryRepository } from "@/infrastructure/auth/prisma-authentication-recovery-repository";
import { lockAdminLifecycle } from "@/infrastructure/auth/admin-lifecycle-guard";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { verifyPassword } from "@/modules/auth/password";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  describe.skip("Auth recovery hardening persistence", () => {
    it("requires DATABASE_URL", () => undefined);
  });
} else {
  describe.sequential("Auth recovery hardening persistence", () => {
    const database = createDatabaseClient();
    const accounts = new AccountAdministrationService(
      new PrismaAccountAdministrationRepository(database),
    );
    const employees = new EmployeeService(
      new PrismaEmployeeRepository(database),
    );
    const recovery = new AuthenticationRecoveryService(
      new PrismaAuthenticationRecoveryRepository(database),
    );
    const marker = randomUUID().slice(0, 8);
    const ids: string[] = [];
    let firstAdminId = "";
    let secondAdminId = "";
    let existingAdminStates: { id: string; isActive: boolean }[] = [];

    beforeAll(async () => {
      existingAdminStates = await database.user.findMany({
        where: { role: "ADMIN_KEPEGAWAIAN" },
        select: { id: true, isActive: true },
      });
      await database.user.updateMany({
        where: { role: "ADMIN_KEPEGAWAIAN" },
        data: { isActive: false },
      });
    });

    async function employee(suffix: string) {
      const row = await database.employee.create({
        data: {
          nip: `HARD-${marker}-${suffix}`,
          fullName: `Pegawai Hardening ${suffix}`,
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
      for (const state of existingAdminStates)
        await database.user.update({
          where: { id: state.id },
          data: { isActive: state.isActive },
        });
      await database.$disconnect();
    });

    it("acquires the transaction-scoped Admin lifecycle lock through Prisma", async () => {
      await expect(
        database.$transaction(async (transaction) => {
          await lockAdminLifecycle(transaction);
        }),
      ).resolves.toBeUndefined();
    });

    it("protects the only login-capable Admin from User deactivation, demotion, and Employee deactivation", async () => {
      const admin = await employee("ONLY");
      firstAdminId = admin.id;
      await accounts.provision(admin.id, {
        role: "ADMIN_KEPEGAWAIAN",
        password: "rahasia",
      });

      await expect(
        accounts.update(admin.id, { isActive: false }),
      ).rejects.toMatchObject({ message: LAST_LOGIN_CAPABLE_ADMIN_MESSAGE });
      await expect(
        accounts.update(admin.id, { role: "PEGAWAI" }),
      ).rejects.toMatchObject({ message: LAST_LOGIN_CAPABLE_ADMIN_MESSAGE });
      await expect(employees.setActive(admin.id, false)).rejects.toMatchObject({
        message: LAST_LOGIN_CAPABLE_ADMIN_MESSAGE,
      });
    });

    it("allows one of two login-capable Admins to be deactivated or demoted", async () => {
      const second = await employee("SECOND");
      secondAdminId = second.id;
      await accounts.provision(second.id, {
        role: "ADMIN_KEPEGAWAIAN",
        password: "rahasia",
      });
      await expect(
        accounts.update(second.id, { isActive: false }),
      ).resolves.toMatchObject({ isActive: false });
      await accounts.update(second.id, { isActive: true });
      await expect(
        accounts.update(second.id, { role: "PEGAWAI" }),
      ).resolves.toMatchObject({ role: "PEGAWAI" });
    });

    it("serializes concurrent Admin-removal mutations so one login-capable Admin remains", async () => {
      await accounts.update(secondAdminId, { role: "ADMIN_KEPEGAWAIAN" });
      const results = await Promise.allSettled([
        accounts.update(firstAdminId, { isActive: false }),
        accounts.update(secondAdminId, { role: "PEGAWAI" }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const capable = await database.user.count({
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
      expect(capable).toBe(1);
    });

    it("does not count inactive or credential-less Admins and leaves Pegawai lifecycle unaffected", async () => {
      const inactive = await employee("INACTIVE");
      const user = await database.user.create({
        data: {
          employeeId: inactive.id,
          role: "ADMIN_KEPEGAWAIAN",
          isActive: false,
        },
      });
      await database.authenticationIdentity.create({
        data: {
          userId: user.id,
          provider: "LOCAL",
          providerSubject: inactive.nip,
          isActive: false,
        },
      });
      const noCredential = await employee("NO-CREDENTIAL");
      const noCredentialUser = await database.user.create({
        data: { employeeId: noCredential.id, role: "ADMIN_KEPEGAWAIAN" },
      });
      await database.authenticationIdentity.create({
        data: {
          userId: noCredentialUser.id,
          provider: "LOCAL",
          providerSubject: noCredential.nip,
        },
      });
      const regular = await employee("REGULAR");
      await accounts.provision(regular.id, {
        role: "PEGAWAI",
        password: "rahasia",
      });
      await expect(
        employees.setActive(regular.id, false),
      ).resolves.toMatchObject({ isActive: false });
    });

    it("resets a normal password and atomically revokes target sessions", async () => {
      const target = await employee("RESET");
      await accounts.provision(target.id, {
        role: "PEGAWAI",
        password: "lama",
      });
      const identity = await database.authenticationIdentity.findFirstOrThrow({
        where: { user: { employeeId: target.id }, provider: "LOCAL" },
        include: { localCredential: true },
      });
      const session = await database.session.create({
        data: {
          authenticationIdentityId: identity.id,
          tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await accounts.resetPassword(target.id, "baru");
      const credential = await database.localCredential.findUniqueOrThrow({
        where: { authenticationIdentityId: identity.id },
      });
      expect(await verifyPassword("baru", credential.passwordHash)).toBe(true);
      expect(
        (
          await database.session.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).revokedAt,
      ).not.toBeNull();
    });

    it("restores an existing account atomically and never provisions missing accounts", async () => {
      const target = await employee("RECOVER");
      await accounts.provision(target.id, {
        role: "PEGAWAI",
        password: "lama",
      });
      const identity = await database.authenticationIdentity.findFirstOrThrow({
        where: { user: { employeeId: target.id }, provider: "LOCAL" },
      });
      await database.employee.update({
        where: { id: target.id },
        data: { isActive: false },
      });
      await database.user.update({
        where: { employeeId: target.id },
        data: { isActive: false },
      });
      await database.authenticationIdentity.update({
        where: { id: identity.id },
        data: { isActive: false },
      });
      const session = await database.session.create({
        data: {
          authenticationIdentityId: identity.id,
          tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await recovery.recover(target.nip, "dipulihkan");
      const restored = await database.employee.findUniqueOrThrow({
        where: { id: target.id },
        include: {
          user: {
            include: {
              authenticationIdentities: { include: { localCredential: true } },
            },
          },
        },
      });
      expect(restored.isActive).toBe(true);
      expect(restored.user).toMatchObject({
        isActive: true,
        role: "ADMIN_KEPEGAWAIAN",
      });
      expect(restored.user!.authenticationIdentities[0]).toMatchObject({
        isActive: true,
      });
      expect(
        await verifyPassword(
          "dipulihkan",
          restored.user!.authenticationIdentities[0]!.localCredential!
            .passwordHash,
        ),
      ).toBe(true);
      expect(
        (
          await database.session.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).revokedAt,
      ).not.toBeNull();

      const withoutAccount = await employee("NO-ACCOUNT");
      await expect(recovery.recover(withoutAccount.nip, "x")).rejects.toThrow(
        "provisioning akun",
      );
      await expect(recovery.recover(`UNKNOWN-${marker}`, "x")).rejects.toThrow(
        "tidak ditemukan",
      );
      expect(
        await database.user.findUnique({
          where: { employeeId: withoutAccount.id },
        }),
      ).toBeNull();
    });
  });
}
