import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
describe("LocalPrivateStorage", () => {
  it("stores content under an opaque key outside public paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "si-cuti-storage-")); roots.push(root);
    const storage = new LocalPrivateStorage(root); const content = new TextEncoder().encode("private");
    const stored = await storage.put(content);
    expect(stored.key).toMatch(/^[0-9a-f]{32}$/); expect(await storage.read(stored.key)).toEqual(Buffer.from(content));
    expect(await readFile(join(root, stored.key.slice(0, 2), stored.key), "utf8")).toBe("private");
  });
  it("rejects traversal and non-opaque identifiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "si-cuti-storage-")); roots.push(root);
    await expect(new LocalPrivateStorage(root).read("../../etc/passwd")).rejects.toThrow("Kunci dokumen tidak valid");
  });
});
