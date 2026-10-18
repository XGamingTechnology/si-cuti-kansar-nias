import { randomUUID, createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { Principal } from "@/modules/auth/service";
import { AvatarError, avatarView } from "@/application/avatar/contracts";
import { AvatarFiles } from "./files";
import { normalizeAvatar } from "./decoder";
const digest = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex");
// All publication and GC share this dedicated namespace lock. It never locks domain records.
export async function avatarLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(741026181)`;
}
export class PrismaAvatarService {
  constructor(
    private db: PrismaClient,
    private files: AvatarFiles,
  ) {}
  private async active(tx: Prisma.TransactionClient, actor: Principal) {
    if (
      !(await tx.user.findFirst({
        where: {
          id: actor.userId,
          isActive: true,
          role: { in: ["PEGAWAI", "ADMIN_KEPEGAWAIAN"] },
          employee: { isActive: true },
        },
      }))
    )
      throw new AvatarError(403, "FORBIDDEN", "Akun tidak aktif.");
  }
  async get(actor: Principal) {
    await this.active(this.db, actor);
    return avatarView(
      await this.db.userAvatar.findUnique({ where: { userId: actor.userId } }),
    );
  }
  async change(
    actor: Principal,
    expected: number,
    key: string,
    input?: { bytes: Uint8Array; mime: string },
  ) {
    // Auth before decoder, then checked again at publication. No client identity enters the query.
    await this.active(this.db, actor);
    const hash = digest(
      JSON.stringify([
        expected,
        input?.mime ?? "DELETE",
        input ? digest(input.bytes) : null,
      ]),
    );
    // Replayed successful operations do not decode again. The current photo, not old bytes, is returned.
    const retry = await this.db.avatarOperation.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: actor.userId,
          idempotencyKey: key,
        },
      },
    });
    if (retry) {
      if (retry.payloadHash !== hash)
        throw new AvatarError(
          409,
          "RETRY_CONFLICT",
          "Kunci retry dipakai untuk permintaan berbeda.",
        );
      return {
        ...(await this.get(actor)),
        appliedVersion: retry.resultVersion,
      };
    }
    const normalized = input
      ? await normalizeAvatar(input.bytes, input.mime)
      : null;
    return this.db.$transaction(
      async (tx) => {
        await avatarLock(tx);
        await this.active(tx, actor);
        const op = await tx.avatarOperation.findUnique({
          where: {
            actorUserId_idempotencyKey: {
              actorUserId: actor.userId,
              idempotencyKey: key,
            },
          },
        });
        if (op) {
          if (op.payloadHash !== hash)
            throw new AvatarError(
              409,
              "RETRY_CONFLICT",
              "Kunci retry dipakai untuk permintaan berbeda.",
            );
          return {
            ...avatarView(
              await tx.userAvatar.findUnique({
                where: { userId: actor.userId },
              }),
            ),
            appliedVersion: op.resultVersion,
          };
        }
        const old = await tx.userAvatar.findUnique({
          where: { userId: actor.userId },
        });
        if ((old?.version ?? 0) !== expected)
          throw new AvatarError(
            409,
            "AVATAR_CONFLICT",
            "Foto telah berubah. Muat foto terbaru sebelum mencoba lagi.",
          );
        const stored = normalized
          ? await this.files.put(normalized.bytes)
          : null;
        if (stored) {
          const written = await this.files.read(stored.key);
          if (digest(written) !== stored.checksum)
            throw Error("Storage verification failed");
        }
        const data = {
          version: expected + 1,
          storageKey: stored?.key ?? null,
          checksum: stored?.checksum ?? null,
          mime: normalized?.mime ?? null,
          width: normalized?.width ?? null,
          height: normalized?.height ?? null,
          updatedAt: new Date(),
        };
        const current = await tx.userAvatar.upsert({
          where: { userId: actor.userId },
          create: { userId: actor.userId, ...data },
          update: data,
        });
        await tx.avatarOperation.create({
          data: {
            id: randomUUID(),
            actorUserId: actor.userId,
            idempotencyKey: key,
            payloadHash: hash,
            action: input ? (old?.storageKey ? "REPLACE" : "UPLOAD") : "DELETE",
            resultVersion: current.version,
          },
        });
        return { ...avatarView(current), appliedVersion: current.version };
      },
      { timeout: 20000, maxWait: 5000 },
    );
    // On failure/uncertain commit never unlink: GC checks active keys under the same lock.
  }
  async image(actor: Principal, version: number) {
    return this.db.$transaction(
      async (tx) => {
        await avatarLock(tx);
        await this.active(tx, actor);
        const v = await tx.userAvatar.findUnique({
          where: { userId: actor.userId },
        });
        if (!v?.storageKey || v.version !== version)
          throw new AvatarError(
            404,
            "AVATAR_NOT_FOUND",
            "Foto tidak tersedia.",
          );
        const bytes = await this.files.read(v.storageKey);
        if (digest(bytes) !== v.checksum)
          throw Error("Avatar checksum mismatch");
        return { bytes, mime: v.mime! };
      },
      { timeout: 10000 },
    );
  }
  async cleanup(now = new Date()) {
    // Scan outside SQL; keys/paths are produced only by the guarded namespace, never client input.
    const candidates = await this.files.candidates(
      new Date(now.getTime() - 24 * 3600000),
    );
    let deleted = 0,
      failed = 0,
      active = 0;
    for (let p = 0; p < candidates.length; p += 100) {
      await this.db.$transaction(
        async (tx) => {
          await avatarLock(tx);
          for (const c of candidates.slice(p, p + 100)) {
            if (
              !c.path.endsWith(".tmp") &&
              (await tx.userAvatar.findFirst({ where: { storageKey: c.key } }))
            ) {
              active++;
              continue;
            }
            try {
              await this.files.removeCandidate(c);
              deleted++;
            } catch {
              failed++;
            }
          }
        },
        { timeout: 20000 },
      );
    }
    return {
      scanned: candidates.length,
      deleted,
      failed,
      active,
      healthy: failed === 0,
    };
  }
}
