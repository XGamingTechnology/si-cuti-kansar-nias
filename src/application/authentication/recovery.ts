import { hashPassword } from "../../modules/auth/password.ts";

export type RecoveryTarget = Readonly<{ nip: string; fullName: string }>;

export interface AuthenticationRecoveryRepository {
  inspect(nip: string): Promise<RecoveryTarget>;
  recover(nip: string, passwordHash: string, changedAt: Date): Promise<void>;
}

export class AuthenticationRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationRecoveryError";
  }
}

export class AuthenticationRecoveryService {
  private readonly repository: AuthenticationRecoveryRepository;

  constructor(repository: AuthenticationRecoveryRepository) {
    this.repository = repository;
  }

  inspect(nip: string) {
    const normalized = nip.trim();
    if (!normalized) throw new AuthenticationRecoveryError("NIP wajib diisi.");
    return this.repository.inspect(normalized);
  }

  async recover(nip: string, password: string, changedAt = new Date()) {
    const normalized = nip.trim();
    if (!normalized) throw new AuthenticationRecoveryError("NIP wajib diisi.");
    if (!password || password.length > 1024)
      throw new AuthenticationRecoveryError(
        "Kata sandi wajib diisi dan maksimal 1024 karakter.",
      );
    await this.repository.recover(
      normalized,
      await hashPassword(password),
      changedAt,
    );
  }
}
