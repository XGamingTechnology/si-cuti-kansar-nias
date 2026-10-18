import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createDatabaseClient } from "@/infrastructure/database/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Principal } from "@/modules/auth/service";
import { PrismaAvatarService } from "@/infrastructure/avatar/service";
import { AvatarFiles } from "@/infrastructure/avatar/files";
const suite =
  process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1" ? describe : describe.skip;
suite("avatars on disposable PostgreSQL and private filesystem", () => {
  const db = createDatabaseClient();
  let root: string,
    files: AvatarFiles,
    service: PrismaAvatarService,
    a: Principal,
    b: Principal,
    admin: Principal,
    input: { bytes: Buffer; mime: string };
  async function actor(role: Principal["role"]) {
    const e = await db.employee.create({
      data: {
        nip: `AV-${randomUUID().slice(0, 26)}`,
        fullName: "Penguji Avatar Sintetis",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
      },
    });
    const u = await db.user.create({ data: { employeeId: e.id, role } });
    return { userId: u.id, employeeId: e.id, fullName: e.fullName, role };
  }
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "avatar-pg-"));
    files = new AvatarFiles(join(root, "avatars"), [
      join(root, "docs"),
      join(root, "reports"),
    ]);
    service = new PrismaAvatarService(db, files);
    a = await actor("PEGAWAI");
    b = await actor("PEGAWAI");
    admin = await actor("ADMIN_KEPEGAWAIAN");
    input = {
      bytes: await sharp({
        create: { width: 800, height: 600, channels: 3, background: "#62a5b9" },
      })
        .png()
        .toBuffer(),
      mime: "image/png",
    };
  });
  afterAll(async () => {
    await db.$disconnect();
    await rm(root, { recursive: true, force: true });
  });
  it("starts with initials state; both roles may mutate only their session identity", async () => {
    expect(await service.get(a)).toMatchObject({ version: 0, hasPhoto: false });
    const v = await service.change(a, 0, randomUUID(), input);
    expect(v).toMatchObject({ version: 1, hasPhoto: true });
    expect(await service.get(b)).toMatchObject({ version: 0, hasPhoto: false });
    await expect(service.image(b, 1)).rejects.toMatchObject({ status: 404 });
    await expect(service.image(admin, 1)).rejects.toMatchObject({
      status: 404,
    });
    expect((await service.change(admin, 0, randomUUID(), input)).hasPhoto).toBe(
      true,
    );
  });
  it("returns only minimal DTO, verifies normalized bytes and audit with server actor/time", async () => {
    const v = await service.get(a);
    expect(JSON.stringify(v)).not.toMatch(
      /storageKey|checksum|userId|employeeId/,
    );
    const image = await service.image(a, v.version);
    const m = await sharp(image.bytes).metadata();
    expect([m.width, m.height]).toEqual([512, 384]);
    const op = await db.avatarOperation.findFirstOrThrow({
      where: { actorUserId: a.userId },
    });
    expect(op.action).toBe("UPLOAD");
    expect(op.createdAt).toBeInstanceOf(Date);
    await expect(
      db.avatarOperation.update({
        where: { id: op.id },
        data: { action: "DELETE" },
      }),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe('TRUNCATE TABLE "AvatarOperation"'),
    ).rejects.toThrow();
  });
  it("retries identical operation once; conflicts never overwrite a newer version", async () => {
    const key = randomUUID();
    const p = await service.change(a, 1, key, input);
    expect(p.version).toBe(2);
    expect((await service.change(a, 1, key, input)).version).toBe(2);
    expect(
      await db.avatarOperation.count({
        where: { actorUserId: a.userId, idempotencyKey: key },
      }),
    ).toBe(1);
    await expect(service.change(a, 2, key)).rejects.toMatchObject({
      code: "RETRY_CONFLICT",
    });
    await expect(
      service.change(a, 1, randomUUID(), input),
    ).rejects.toMatchObject({ code: "AVATAR_CONFLICT" });
    await service.change(a, 2, randomUUID(), input);
    expect(await service.change(a, 1, key, input)).toMatchObject({
      version: 3,
      appliedVersion: 2,
      hasPhoto: true,
    });
  });
  it("invalid replacement/storage failure preserves old active photo", async () => {
    const before = await service.get(a),
      bytes = await service.image(a, before.version);
    await expect(
      service.change(a, before.version, randomUUID(), {
        bytes: Buffer.from("bad"),
        mime: "image/png",
      }),
    ).rejects.toMatchObject({ status: 422 });
    const spy = vi
      .spyOn(files, "put")
      .mockRejectedValueOnce(Error("disk full"));
    await expect(
      service.change(a, before.version, randomUUID(), input),
    ).rejects.toThrow();
    spy.mockRestore();
    expect(await service.get(a)).toEqual(before);
    expect((await service.image(a, before.version)).bytes).toEqual(bytes.bytes);
  });
  it("concurrent different updates produce one version winner, identical retries one operation", async () => {
    const v = await service.get(b),
      key = randomUUID();
    const same = await Promise.all([
      service.change(b, v.version, key, input),
      service.change(b, v.version, key, input),
    ]);
    expect(same[0].version).toBe(same[1].version);
    expect(
      await db.avatarOperation.count({ where: { actorUserId: b.userId } }),
    ).toBe(1);
    const results = await Promise.allSettled([
      service.change(b, 1, randomUUID(), input),
      service.change(b, 1, randomUUID(), input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "AVATAR_CONFLICT" },
    });
  });
  it("audit insertion failure rolls back metadata; orphan cleanup retains active and retries safely", async () => {
    const before = await service.get(a);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION avatar_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorUserId"='${a.userId}'::uuid THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER avatar_test_failure BEFORE INSERT ON "AvatarOperation" FOR EACH ROW EXECUTE FUNCTION avatar_test_fail_audit()',
    );
    try {
      await expect(
        service.change(a, before.version, randomUUID(), input),
      ).rejects.toThrow();
      expect(await service.get(a)).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER avatar_test_failure ON "AvatarOperation"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION avatar_test_fail_audit()");
    }
    const activeKey = (
      await db.userAvatar.findUniqueOrThrow({ where: { userId: a.userId } })
    ).storageKey!;
    await writeFile(
      join(
        files.root,
        activeKey.slice(0, 2),
        `${activeKey}.${randomUUID()}.tmp`,
      ),
      Buffer.from("temporary synthetic bytes"),
    );
    const old = new Date(Date.now() - 25 * 3600000);
    for (const p of await readdir(files.root)) {
      if (p.startsWith(".")) continue;
      for (const f of await readdir(join(files.root, p)))
        await utimes(join(files.root, p, f), old, old);
    }
    const row = await db.userAvatar.findUniqueOrThrow({
      where: { userId: a.userId },
    });
    const read = await service.image(a, before.version);
    const result = await service.cleanup();
    expect(result.deleted).toBeGreaterThan(0);
    expect(result.active).toBe(3);
    expect(result.failed).toBe(0);
    expect((await service.image(a, before.version)).bytes).toEqual(read.bytes);
    expect((await service.cleanup()).deleted).toBe(0);
    expect(row.storageKey).toBeTruthy();
  });
  it("cleanup failure retries and concurrent publication never loses the active image", async () => {
    const orphan = await files.put(input.bytes);
    const old = new Date(Date.now() - 25 * 3600000);
    await utimes(
      join(files.root, orphan.key.slice(0, 2), orphan.key),
      old,
      old,
    );
    const fail = vi
      .spyOn(files, "removeCandidate")
      .mockRejectedValueOnce(Error("EACCES"));
    expect((await service.cleanup()).failed).toBe(1);
    fail.mockRestore();
    const current = await service.get(a);
    await Promise.all([
      service.change(a, current.version, randomUUID(), input),
      service.cleanup(),
    ]);
    const active = await service.get(a);
    expect(active.version).toBe(current.version + 1);
    expect(
      (await service.image(a, active.version)).bytes.length,
    ).toBeGreaterThan(0);
    expect((await service.cleanup()).healthy).toBe(true);
  });
  it("uncertain commit response never deletes a committed active file; retry recovers", async () => {
    const expected = (await service.get(a)).version,
      key = randomUUID();
    const ambiguous = {
      user: db.user,
      avatarOperation: db.avatarOperation,
      $transaction: async (
        work: Parameters<PrismaClient["$transaction"]>[0],
      ) => {
        await db.$transaction(work as never);
        throw Error("connection lost after commit");
      },
    } as unknown as PrismaClient;
    await expect(
      new PrismaAvatarService(ambiguous, files).change(a, expected, key, input),
    ).rejects.toThrow();
    expect((await service.get(a)).version).toBe(expected + 1);
    expect((await service.image(a, expected + 1)).bytes.length).toBeGreaterThan(
      0,
    );
    expect((await service.change(a, expected, key, input)).appliedVersion).toBe(
      expected + 1,
    );
  });
  it("delete is audited/idempotent, invalidates old URL and later upload uses a new version", async () => {
    const before = await service.get(a),
      key = randomUUID();
    const deleted = await service.change(a, before.version, key);
    expect(deleted).toMatchObject({
      hasPhoto: false,
      imageUrl: null,
      version: before.version + 1,
    });
    await expect(service.image(a, before.version)).rejects.toMatchObject({
      status: 404,
    });
    expect(await service.change(a, before.version, key)).toEqual(deleted);
    expect(
      (await service.change(a, deleted.version, randomUUID(), input)).version,
    ).toBe(deleted.version + 1);
    expect(await service.change(a, before.version, key)).toMatchObject({
      hasPhoto: true,
      version: deleted.version + 1,
      appliedVersion: deleted.version,
    });
  });
  it("deactivation prevents read/write/delete of previously created avatar", async () => {
    await db.user.update({
      where: { id: b.userId },
      data: { isActive: false },
    });
    await expect(service.get(b)).rejects.toMatchObject({ status: 403 });
    await expect(service.image(b, 2)).rejects.toMatchObject({ status: 403 });
    await expect(service.change(b, 2, randomUUID())).rejects.toMatchObject({
      status: 403,
    });
  });
});
