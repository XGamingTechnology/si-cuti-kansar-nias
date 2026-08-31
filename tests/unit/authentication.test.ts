import { describe, expect, it } from "vitest";
import { AuthenticationService, PUBLIC_AUTH_ERROR, hashPassword, type AuthRepository, type LoginIdentity } from "@/modules/auth/service";
import { digestSessionToken, sessionCookieOptions } from "@/modules/auth/session";

const now = new Date("2026-08-31T12:00:00Z");
async function fixture(overrides: Partial<LoginIdentity> = {}) {
  const passwordHash = await hashPassword("KataSandi-Yang-Kuat-123!");
  const identity: LoginIdentity = { identityId: "identity", userId: "user", employeeId: "employee", fullName: "Pegawai Uji", role: "PEGAWAI", passwordHash, employeeActive: true, userActive: true, identityActive: true, ...overrides };
  const sessions: Array<{ identityId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }> = [];
  const repository: AuthRepository = {
    async findLocalIdentity(nip) { return nip === "TEST-001" ? identity : null; },
    async createSession(identityId, tokenHash, expiresAt) { sessions.push({ identityId, tokenHash, expiresAt, revokedAt: null }); },
    async findSession(tokenHash) { const session = sessions.find((item) => item.tokenHash === tokenHash); return session ? { ...identity, expiresAt: session.expiresAt, revokedAt: session.revokedAt } : null; },
    async revokeSession(tokenHash, revokedAt) { const session = sessions.find((item) => item.tokenHash === tokenHash); if (session) session.revokedAt = revokedAt; },
  };
  return { service: new AuthenticationService(repository, 3600), identity, sessions };
}

describe("local authentication and opaque sessions", () => {
  it("logs in with NIP and the correct password without storing the raw password", async () => {
    const { service, identity, sessions } = await fixture();
    const result = await service.login("TEST-001", "KataSandi-Yang-Kuat-123!", now);
    expect(result.principal.employeeId).toBe("employee");
    expect(identity.passwordHash).not.toContain("KataSandi-Yang-Kuat-123!");
    expect(identity.passwordHash).toMatch(/^scrypt\$/);
    expect(sessions).toHaveLength(1);
  });

  it.each([
    ["unknown NIP", "UNKNOWN", "KataSandi-Yang-Kuat-123!", {}],
    ["wrong password", "TEST-001", "salah", {}],
    ["inactive Employee", "TEST-001", "KataSandi-Yang-Kuat-123!", { employeeActive: false }],
    ["inactive User", "TEST-001", "KataSandi-Yang-Kuat-123!", { userActive: false }],
    ["inactive AuthenticationIdentity", "TEST-001", "KataSandi-Yang-Kuat-123!", { identityActive: false }],
  ])("rejects %s with the same public error", async (_name, nip, password, overrides) => {
    const { service, sessions } = await fixture(overrides);
    await expect(service.login(nip as string, password as string, now)).rejects.toThrow(PUBLIC_AUTH_ERROR);
    expect(sessions).toHaveLength(0);
  });

  it("returns the raw token only to the caller and stores its SHA-256 digest only", async () => {
    const { service, sessions } = await fixture();
    const { token } = await service.login("TEST-001", "KataSandi-Yang-Kuat-123!", now);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(sessions[0]?.tokenHash).toBe(digestSessionToken(token));
    expect(sessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions[0]?.tokenHash).not.toBe(token);
  });

  it("rejects expired and revoked sessions", async () => {
    const { service, sessions } = await fixture();
    const { token } = await service.login("TEST-001", "KataSandi-Yang-Kuat-123!", now);
    expect(await service.validate(token, new Date(now.getTime() + 3_600_001))).toBeNull();
    sessions[0]!.expiresAt = new Date(now.getTime() + 7200000); sessions[0]!.revokedAt = now;
    expect(await service.validate(token, now)).toBeNull();
  });

  it("revokes a session on logout", async () => {
    const { service, sessions } = await fixture();
    const { token } = await service.login("TEST-001", "KataSandi-Yang-Kuat-123!", now);
    await service.logout(token, now);
    expect(sessions[0]?.revokedAt).toEqual(now);
    expect(await service.validate(token, now)).toBeNull();
  });

  it("uses the required cookie attributes", () => {
    expect(sessionCookieOptions(false, 28800)).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 28800 });
    expect(sessionCookieOptions(true, 28800).secure).toBe(true);
  });
});
