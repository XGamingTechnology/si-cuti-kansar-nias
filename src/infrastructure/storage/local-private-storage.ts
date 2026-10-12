import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import type {
  DocumentStorage,
  StoredDocument,
} from "@/application/ports/document-storage";

const KEY_PATTERN = /^[0-9a-f]{32}$/;
export class LocalPrivateStorage implements DocumentStorage {
  private readonly root: string;
  constructor(root: string) {
    if (!isAbsolute(root))
      throw new Error("Lokasi penyimpanan privat harus absolut");
    this.root = resolve(root);
  }
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Kunci dokumen tidak valid");
    const path = resolve(join(this.root, key.slice(0, 2), key));
    if (!path.startsWith(`${this.root}${sep}`))
      throw new Error("Kunci dokumen tidak valid");
    return path;
  }
  async put(content: Uint8Array): Promise<StoredDocument> {
    const key = randomUUID().replaceAll("-", "");
    const destination = this.pathFor(key);
    await mkdir(resolve(destination, ".."), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
    return {
      key,
      size: content.byteLength,
      checksum: createHash("sha256").update(content).digest("hex"),
    };
  }
  async read(key: string) {
    return readFile(this.pathFor(key));
  }
  async delete(key: string) {
    return rm(this.pathFor(key), { force: true });
  }
}
