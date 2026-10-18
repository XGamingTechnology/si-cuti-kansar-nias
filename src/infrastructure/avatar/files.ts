import {
  mkdir,
  readdir,
  lstat,
  readFile,
  writeFile,
  realpath,
  rm,
} from "node:fs/promises";
import { resolve, isAbsolute, sep, join, basename } from "node:path";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
const marker = ".si-cuti-avatar-storage",
  content = "si-cuti-avatar-storage-v1\n";
const overlap = (a: string, b: string) =>
  a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
async function canonical(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const parent = resolve(p, "..");
    if (parent === p) throw e;
    return join(await canonical(parent), basename(p));
  }
}
export class AvatarFiles {
  readonly root: string;
  private store: LocalPrivateStorage;
  constructor(
    root: string,
    private protectedRoots: string[],
  ) {
    if (
      !isAbsolute(root) ||
      root === sep ||
      protectedRoots.some(
        (p) => !isAbsolute(p) || overlap(resolve(root), resolve(p)),
      )
    )
      throw Error(
        "AVATAR_STORAGE_PATH harus absolut dan terpisah dari dokumen/laporan/public.",
      );
    this.root = resolve(root);
    this.store = new LocalPrivateStorage(this.root);
  }
  async initialize(create = true) {
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await lstat(this.root);
    if (!root.isDirectory() || root.isSymbolicLink())
      throw Error("Root avatar tidak valid.");
    const actual = await canonical(this.root);
    for (const p of this.protectedRoots) {
      if (overlap(actual, await canonical(p)))
        throw Error("Namespace avatar bertumpuk.");
      const st = await lstat(p).catch(() => null);
      if (st && st.dev === root.dev && st.ino === root.ino)
        throw Error("Volume avatar bertumpuk.");
    }
    const names = await readdir(this.root);
    for (const name of names) {
      if (/^[a-f0-9]{2}$/.test(name)) {
        const st = await lstat(join(this.root, name));
        if (!st.isDirectory() || st.isSymbolicLink())
          throw Error("Prefix avatar tidak valid.");
      }
    }
    try {
      if ((await readFile(join(this.root, marker), "utf8")) !== content)
        throw Error("Marker avatar tidak valid.");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      if (!create || names.length)
        throw Error("Root avatar harus kosong; cleanup tidak membuat marker.");
      try {
        await writeFile(join(this.root, marker), content, {
          flag: "wx",
          mode: 0o600,
        });
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code !== "EEXIST" ||
          (await readFile(join(this.root, marker), "utf8")) !== content
        )
          throw e;
      }
    }
  }
  private path(key: string) {
    if (!/^[a-f0-9]{32}$/.test(key)) throw Error("Kunci avatar tidak valid.");
    return join(this.root, key.slice(0, 2), key);
  }
  async put(bytes: Uint8Array) {
    await this.initialize();
    return this.store.put(bytes);
  }
  async read(key: string) {
    await this.initialize(false);
    const st = await lstat(this.path(key));
    if (!st.isFile() || st.isSymbolicLink() || st.size > 5 * 1024 * 1024)
      throw Error("Berkas avatar tidak valid.");
    return this.store.read(key);
  }
  async candidates(before: Date) {
    await this.initialize(false);
    const found: { key: string; path: string }[] = [];
    let scanned = 0;
    for (const prefix of await readdir(this.root)) {
      if (prefix === marker) continue;
      if (!/^[a-f0-9]{2}$/.test(prefix))
        throw Error("Isi namespace tidak dikenal.");
      for (const name of await readdir(join(this.root, prefix))) {
        if (++scanned > 10000)
          throw Error("Backlog avatar >10000; periksa operator.");
        const match = /^([a-f0-9]{32})(?:\.[a-f0-9-]{36}\.tmp)?$/.exec(name);
        if (!match || match[1].slice(0, 2) !== prefix)
          throw Error("File avatar tidak dikenal.");
        const path = join(this.root, prefix, name),
          st = await lstat(path);
        if (!st.isFile() || st.isSymbolicLink())
          throw Error("File avatar tidak valid.");
        if (st.mtime <= before) found.push({ key: match[1], path });
      }
    }
    return found;
  }
  async removeCandidate(c: { path: string; key: string }) {
    if (!c.path.startsWith(this.root + sep)) throw Error("Path tidak valid.");
    await rm(c.path, { force: true });
  }
}
