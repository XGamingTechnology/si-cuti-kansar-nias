import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeAvatar } from "@/infrastructure/avatar/decoder";
import { AvatarFiles } from "@/infrastructure/avatar/files";
import { parseAvatarView } from "@/application/avatar/contracts";
import { mkdtemp, rm, mkdir, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("private avatar decoder and namespace", () => {
  it.each(["jpeg", "png"] as const)(
    "decodes/normalises %s, keeps ratio and strips EXIF/orientation metadata",
    async (format) => {
      const input = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: "#3182a5",
        },
      })
        [format]()
        .withMetadata({
          orientation: 6,
          exif: { IFD0: { ImageDescription: "PRIVATE_EXIF_SENTINEL" } },
        })
        .toBuffer();
      const result = await normalizeAvatar(input, `image/${format}`),
        m = await sharp(result.bytes).metadata();
      expect([m.width, m.height]).toEqual([341, 512]);
      expect(m.exif).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(m.orientation).toBeUndefined();
      expect(result.bytes.includes(Buffer.from("PRIVATE_EXIF_SENTINEL"))).toBe(
        false,
      );
    },
  );
  it("does not enlarge small PNG and preserves alpha", async () => {
    const b = await sharp({
      create: {
        width: 20,
        height: 10,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const r = await normalizeAvatar(b, "image/png");
    expect([r.width, r.height]).toEqual([20, 10]);
    expect((await sharp(r.bytes).metadata()).hasAlpha).toBe(true);
  });
  it.each(["image/svg+xml", "application/octet-stream", "text/plain"])(
    "rejects declared %s before decode",
    async (mime) => {
      await expect(
        normalizeAvatar(Buffer.from("<svg/>"), mime),
      ).rejects.toMatchObject({ status: 415 });
    },
  );
  it("rejects MIME spoof, corrupt and truncated images", async () => {
    const png = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    for (const [b, m] of [
      [png, "image/jpeg"],
      [Buffer.from("<svg/>"), "image/png"],
      [png.subarray(0, 45), "image/png"],
    ] as const)
      await expect(normalizeAvatar(b, m)).rejects.toMatchObject({
        status: 422,
      });
  });
  it("rejects empty and over 5 MiB input", async () => {
    for (const b of [Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)])
      await expect(normalizeAvatar(b, "image/png")).rejects.toMatchObject({
        status: 413,
      });
  });
  it("rejects excessive side and pixel count before full output processing", async () => {
    for (const [width, height] of [
      [8193, 1],
      [4100, 4100],
    ]) {
      const b = await sharp({
        create: { width, height, channels: 3, background: "red" },
      })
        .png()
        .toBuffer();
      await expect(normalizeAvatar(b, "image/png")).rejects.toMatchObject({
        status: 422,
      });
    }
  });
  it("rejects GIF and APNG animation chunks", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const apng = Buffer.concat([
      png.subarray(0, 33),
      Buffer.from([0, 0, 0, 8]),
      Buffer.from("acTL"),
      Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]),
      Buffer.alloc(4),
      png.subarray(33),
    ]);
    for (const b of [
      Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
      apng,
    ])
      await expect(normalizeAvatar(b, "image/png")).rejects.toMatchObject({
        status: 422,
      });
  });
  it("rejects overlapping roots/public, path traversal and symlink prefixes", async () => {
    const root = await mkdtemp(join(tmpdir(), "avatar-unit-"));
    try {
      expect(
        () =>
          new AvatarFiles(join(root, "docs", "avatars"), [join(root, "docs")]),
      ).toThrow();
      const f = new AvatarFiles(join(root, "avatars"), [join(root, "docs")]);
      await f.initialize();
      await expect(f.read("../../secret")).rejects.toThrow(
        "Kunci avatar tidak valid",
      );
      await symlink(root, join(f.root, "ab"));
      await expect(f.initialize()).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("cleanup refuses unmarked roots and never adopts another namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "avatar-unmarked-"));
    try {
      const f = new AvatarFiles(root, [join(root, "..", "separate-docs")]);
      await expect(f.initialize(false)).rejects.toThrow();
      expect(await readdir(root)).toEqual([]);
      await mkdir(join(root, "ab"));
      await expect(f.initialize()).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("accepts only self URL metadata and rejects remote image authority", () => {
    expect(
      parseAvatarView({
        version: 2,
        hasPhoto: true,
        imageUrl: "/api/me/avatar/image?v=2",
        updatedAt: null,
      }).version,
    ).toBe(2);
    expect(() =>
      parseAvatarView({
        version: 2,
        hasPhoto: true,
        imageUrl: "https://example.test/photo",
        updatedAt: null,
      }),
    ).toThrow();
  });
});
