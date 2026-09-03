import { describe, expect, it } from "vitest";
import {
  AccountAdministrationError,
  AccountAdministrationService,
  type AccountAdministrationRepository,
  type AccountStatus,
} from "@/application/accounts/service";
import { verifyPassword } from "@/modules/auth/password";

const employeeId = "00000000-0000-4000-8000-000000000001";

function fixture(exists = false) {
  let account: AccountStatus | null = exists
    ? { employeeId, username: "TEST-001", role: "PEGAWAI", isActive: true }
    : null;
  let passwordHash: string | null = null;
  let passwordChangedAt: Date | null = null;
  const repository: AccountAdministrationRepository = {
    async findByEmployeeId() {
      return account;
    },
    async provision(id, role, hash) {
      passwordHash = hash;
      account = { employeeId: id, username: "TEST-001", role, isActive: true };
      return account;
    },
    async updateRole(_id, role) {
      if (!account)
        throw new AccountAdministrationError(
          "NOT_FOUND",
          "Akun tidak ditemukan.",
        );
      account = { ...account, role };
      return account;
    },
    async updateActive(_id, isActive) {
      if (!account)
        throw new AccountAdministrationError(
          "NOT_FOUND",
          "Akun tidak ditemukan.",
        );
      account = { ...account, isActive };
      return account;
    },
    async resetLocalPassword(_id, hash, changedAt) {
      if (!account)
        throw new AccountAdministrationError(
          "NOT_FOUND",
          "Akun tidak ditemukan.",
        );
      passwordHash = hash;
      passwordChangedAt = changedAt;
      return account;
    },
  };
  return {
    service: new AccountAdministrationService(repository),
    values: () => ({ account, passwordHash, passwordChangedAt }),
  };
}

describe("AccountAdministrationService", () => {
  it.each(["PEGAWAI", "ADMIN_KEPEGAWAIAN"] as const)(
    "provisions a complete LOCAL account with approved role %s and a secure hash",
    async (role) => {
      const { service, values } = fixture();
      const result = await service.provision(employeeId, {
        role,
        password: "rahasia-uji",
      });
      expect(result).toMatchObject({
        employeeId,
        username: "TEST-001",
        role,
        isActive: true,
      });
      expect(values().passwordHash).not.toBe("rahasia-uji");
      expect(await verifyPassword("rahasia-uji", values().passwordHash!)).toBe(
        true,
      );
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("passwordHash");
    },
  );

  it("rejects duplicate provisioning", async () => {
    await expect(
      fixture(true).service.provision(employeeId, {
        role: "PEGAWAI",
        password: "x",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["ADMIN", "", null, 42])("rejects invalid role %s", async (role) => {
    await expect(
      fixture().service.provision(employeeId, { role, password: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it.each(["", "x".repeat(1025)])(
    "rejects invalid password input",
    async (password) => {
      await expect(
        fixture().service.provision(employeeId, { role: "PEGAWAI", password }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    },
  );

  it("deactivates, reactivates, and changes only to an approved role", async () => {
    const { service } = fixture(true);
    expect(
      (await service.update(employeeId, { isActive: false })).isActive,
    ).toBe(false);
    expect(
      (await service.update(employeeId, { isActive: true })).isActive,
    ).toBe(true);
    expect(
      (await service.update(employeeId, { role: "ADMIN_KEPEGAWAIAN" })).role,
    ).toBe("ADMIN_KEPEGAWAIAN");
    await expect(
      service.update(employeeId, { role: "KEPALA_KANTOR" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("resets password with a different hash and passwordChangedAt", async () => {
    const { service, values } = fixture();
    await service.provision(employeeId, { role: "PEGAWAI", password: "lama" });
    const oldHash = values().passwordHash!;
    const changedAt = new Date("2026-09-03T10:00:00Z");
    await service.resetPassword(employeeId, "baru", changedAt);
    const newHash = values().passwordHash!;
    expect(newHash).not.toBe(oldHash);
    expect(values().passwordChangedAt).toEqual(changedAt);
    expect(await verifyPassword("lama", newHash)).toBe(false);
    expect(await verifyPassword("baru", newHash)).toBe(true);
  });

  it("has no hard-delete operation", () => {
    expect("delete" in fixture().service).toBe(false);
  });

  it("preserves a safe NOT_FOUND result for a missing Employee", async () => {
    const repository = {
      findByEmployeeId: async () => {
        throw new AccountAdministrationError(
          "NOT_FOUND",
          "Pegawai tidak ditemukan.",
        );
      },
    } as unknown as AccountAdministrationRepository;
    await expect(
      new AccountAdministrationService(repository).provision(employeeId, {
        role: "PEGAWAI",
        password: "x",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Pegawai tidak ditemukan.",
    });
  });
});
