import { hashPassword, verifyPassword } from "./password";
import { createSessionToken, digestSessionToken } from "./session";

export const PUBLIC_AUTH_ERROR = "NIP atau kata sandi tidak valid.";

export type Principal = Readonly<{ userId: string; employeeId: string; fullName: string; role: "ADMIN_KEPEGAWAIAN" | "PEGAWAI" }>;
export type LoginIdentity = Principal & Readonly<{ identityId: string; passwordHash: string; employeeActive: boolean; userActive: boolean; identityActive: boolean }>;
export interface AuthRepository {
  findLocalIdentity(nip: string): Promise<LoginIdentity | null>;
  createSession(identityId: string, tokenHash: string, expiresAt: Date, now: Date): Promise<void>;
  findSession(tokenHash: string): Promise<(Principal & Readonly<{ expiresAt: Date; revokedAt: Date | null; employeeActive: boolean; userActive: boolean; identityActive: boolean }>) | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

// Valid, deliberately unusable hash used only to make unknown-user verification do comparable work.
const DUMMY_HASH = "scrypt$v=1$N=32768,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export class AuthenticationService {
  constructor(private readonly repository: AuthRepository, private readonly ttlSeconds = 28800) {}
  async login(nip: string, password: string, now = new Date()) {
    const identity = await this.repository.findLocalIdentity(nip);
    const passwordValid = await verifyPassword(password, identity?.passwordHash ?? DUMMY_HASH);
    if (!identity || !passwordValid || !identity.employeeActive || !identity.userActive || !identity.identityActive) throw new Error(PUBLIC_AUTH_ERROR);
    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    await this.repository.createSession(identity.identityId, digestSessionToken(token), expiresAt, now);
    return { token, expiresAt, principal: identity };
  }
  async validate(token: string | undefined, now = new Date()): Promise<Principal | null> {
    if (!token) return null;
    const session = await this.repository.findSession(digestSessionToken(token));
    if (!session || session.revokedAt || session.expiresAt <= now || !session.employeeActive || !session.userActive || !session.identityActive) return null;
    return session;
  }
  async logout(token: string | undefined, now = new Date()) {
    if (token) await this.repository.revokeSession(digestSessionToken(token), now);
  }
}

export { hashPassword };
