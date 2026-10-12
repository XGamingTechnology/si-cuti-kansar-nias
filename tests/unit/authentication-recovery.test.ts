import { describe, expect, it } from "vitest";
import {
  AuthenticationRecoveryError,
  AuthenticationRecoveryService,
  type AuthenticationRecoveryRepository,
} from "@/application/authentication/recovery";
import { verifyPassword } from "@/modules/auth/password";

function fixture() {
  let mutation:
    | { nip: string; passwordHash: string; changedAt: Date }
    | undefined;
  const repository: AuthenticationRecoveryRepository = {
    async inspect(nip) {
      if (nip === "UNKNOWN")
        throw new AuthenticationRecoveryError(
          "Pegawai dengan NIP tersebut tidak ditemukan.",
        );
      if (nip === "NO-ACCOUNT")
        throw new AuthenticationRecoveryError(
          "Pegawai ditemukan, tetapi akun LOCAL lengkap tidak tersedia. Lakukan provisioning akun melalui Admin normal.",
        );
      return { nip, fullName: "Pegawai Uji" };
    },
    async recover(nip, passwordHash, changedAt) {
      mutation = { nip, passwordHash, changedAt };
    },
  };
  return {
    service: new AuthenticationRecoveryService(repository),
    mutation: () => mutation,
  };
}

describe("AuthenticationRecoveryService", () => {
  it("uses the application password hasher without exposing plaintext", async () => {
    const { service, mutation } = fixture();
    const changedAt = new Date("2026-09-06T00:00:00Z");
    await service.recover(" TEST-001 ", "rahasia-baru", changedAt);
    expect(mutation()).toMatchObject({ nip: "TEST-001", changedAt });
    expect(mutation()!.passwordHash).not.toContain("rahasia-baru");
    expect(await verifyPassword("rahasia-baru", mutation()!.passwordHash)).toBe(
      true,
    );
  });

  it("rejects empty and oversized passwords before persistence", async () => {
    const { service, mutation } = fixture();
    await expect(service.recover("TEST-001", "")).rejects.toMatchObject({
      name: "AuthenticationRecoveryError",
    });
    await expect(
      service.recover("TEST-001", "x".repeat(1025)),
    ).rejects.toMatchObject({ name: "AuthenticationRecoveryError" });
    expect(mutation()).toBeUndefined();
  });

  it("reports unknown NIP and missing LOCAL accounts without provisioning", async () => {
    const { service, mutation } = fixture();
    await expect(service.inspect("UNKNOWN")).rejects.toThrow("tidak ditemukan");
    await expect(service.inspect("NO-ACCOUNT")).rejects.toThrow(
      "provisioning akun",
    );
    expect(mutation()).toBeUndefined();
  });
});
