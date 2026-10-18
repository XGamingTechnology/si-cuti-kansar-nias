import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { avatarHandler } from "@/application/avatar/http";
import { AvatarError } from "@/application/avatar/contracts";
import type { createAvatarRuntime } from "@/infrastructure/avatar/runtime";
function deps(authenticated = true) {
  const actor = {
    userId: randomUUID(),
    employeeId: randomUUID(),
    role: "PEGAWAI",
    fullName: "Sintetis",
  };
  const service = {
    get: vi.fn(async () => ({
      version: 0,
      hasPhoto: false,
      imageUrl: null,
      updatedAt: null,
    })),
    change: vi.fn(async () => ({
      version: 1,
      hasPhoto: false,
      imageUrl: null,
      updatedAt: null,
    })),
    image: vi.fn(async () => ({
      bytes: Buffer.from("image"),
      mime: "image/png",
    })),
  };
  const validate = vi.fn(async () => (authenticated ? actor : null)),
    disconnect = vi.fn();
  return {
    actor,
    service,
    validate,
    disconnect,
    factory: () =>
      ({
        authentication: { validate },
        avatars: service,
        database: { $disconnect: disconnect },
      }) as unknown as ReturnType<typeof createAvatarRuntime>,
  };
}
const req = (suffix = "", init?: RequestInit) =>
  new Request(`http://localhost/api/me/avatar${suffix}`, init);
const write = (extra: RequestInit = {}) => ({
  method: "PUT",
  headers: {
    "content-type": "image/png",
    "if-match": '"0"',
    "idempotency-key": randomUUID(),
  },
  body: Buffer.from("PNG"),
  ...extra,
});
describe("self-only avatar delivery", () => {
  it.each(["metadata", "image", "upload", "delete"] as const)(
    "rejects anonymous %s before reads/decoder/write",
    async (operation) => {
      const d = deps(false);
      expect((await avatarHandler(operation, d.factory)(req())).status).toBe(
        401,
      );
      expect(d.service.get).not.toHaveBeenCalled();
      expect(d.service.change).not.toHaveBeenCalled();
      expect(d.service.image).not.toHaveBeenCalled();
    },
  );
  it("takes only authenticated owner, rejects authority query, JSON and delete payload", async () => {
    const d = deps();
    for (const q of [
      `?employeeId=${randomUUID()}`,
      `?userId=${randomUUID()}`,
      "?path=../../secret",
    ]) {
      expect(
        (await avatarHandler("upload", d.factory)(req(q, write()))).status,
      ).toBe(422);
    }
    expect(
      (
        await avatarHandler(
          "upload",
          d.factory,
        )(
          req(
            "",
            write({
              headers: {
                "if-match": '"0"',
                "idempotency-key": randomUUID(),
                "content-type": "application/json",
              },
              body: '{"userId":"other"}',
            }),
          ),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await avatarHandler(
          "delete",
          d.factory,
        )(req("", { ...write(), method: "DELETE" }))
      ).status,
    ).toBe(413);
    expect(d.service.change).not.toHaveBeenCalled();
  });
  it("requires retry/version and checks CSRF origin", async () => {
    const d = deps();
    expect(
      (
        await avatarHandler(
          "upload",
          d.factory,
        )(req("", { method: "PUT", body: "x" }))
      ).status,
    ).toBe(422);
    expect(
      (
        await avatarHandler(
          "upload",
          d.factory,
        )(
          req(
            "",
            write({
              headers: {
                origin: "https://attacker.example",
                "if-match": '"0"',
                "idempotency-key": randomUUID(),
                "content-type": "image/png",
              },
            }),
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("accepts a matching public Host behind internal HTTP while rejecting forged origin/forwarded host", async () => {
    const d = deps();
    const send = (origin: string, host: string) =>
      req(
        "",
        write({
          headers: {
            origin,
            host,
            "x-forwarded-host": "evil.test",
            "if-match": '"0"',
            "idempotency-key": randomUUID(),
            "content-type": "image/png",
          },
        }),
      );
    expect(
      (
        await avatarHandler(
          "upload",
          d.factory,
        )(send("https://si-cuti.example.test", "si-cuti.example.test"))
      ).status,
    ).toBe(200);
    expect(
      (
        await avatarHandler(
          "upload",
          d.factory,
        )(send("https://evil.test", "si-cuti.example.test"))
      ).status,
    ).toBe(403);
  });
  it("streams a bounded binary body and passes only server actor/version/key", async () => {
    const d = deps();
    const r = await avatarHandler("upload", d.factory)(req("", write()));
    expect(r.status).toBe(200);
    expect(d.service.change).toHaveBeenCalledWith(
      d.actor,
      0,
      expect.any(String),
      expect.objectContaining({ mime: "image/png" }),
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("vary")).toBe("Cookie");
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    expect(
      (await avatarHandler("upload", d.factory)(req("", write({ body: huge }))))
        .status,
    ).toBe(413);
  });
  it("image validates version/path and rechecks session before returning no-store private bytes", async () => {
    const d = deps();
    for (const suffix of [
      "/image?v=../secret",
      "/image?v=1&userId=other",
      "/image?v=1&v=2",
    ]) {
      expect(
        (await avatarHandler("image", d.factory)(req(suffix))).status,
      ).toBe(422);
    }
    const r = await avatarHandler("image", d.factory)(req("/image?v=1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toContain("no-store");
    d.validate.mockResolvedValueOnce(d.actor).mockResolvedValueOnce(null);
    expect(
      (await avatarHandler("image", d.factory)(req("/image?v=1"))).status,
    ).toBe(401);
  });
  it("fails closed and never logs storage keys on service error", async () => {
    const d = deps();
    d.service.get.mockRejectedValueOnce(Error("SECRET_STORAGE_KEY"));
    const r = await avatarHandler("metadata", d.factory)(req());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("SECRET");
    d.service.change.mockRejectedValueOnce(
      new AvatarError(409, "AVATAR_CONFLICT", "Muat foto terbaru."),
    );
    expect(
      (await avatarHandler("upload", d.factory)(req("", write()))).status,
    ).toBe(409);
  });
});
