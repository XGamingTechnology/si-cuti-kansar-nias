import {
  mkdir,
  readFile,
  readdir,
  lstat,
  writeFile,
  utimes,
  realpath,
} from "node:fs/promises";
import { resolve, join, isAbsolute, sep, basename } from "node:path";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import {
  ReportError,
  type ReportFiles,
} from "@/application/reporting/contracts";
const MARKER = ".si-cuti-m7-report-storage",
  CONTENT = "si-cuti-m7-report-storage-v1\n";
export class LocalReportFiles implements ReportFiles {
  private readonly storage: LocalPrivateStorage;
  readonly root: string;
  constructor(
    root: string,
    private readonly documentRoot: string,
    private readonly clock = () => new Date(),
  ) {
    if (!isAbsolute(root) || !isAbsolute(documentRoot))
      throw new Error(
        "REPORT_STORAGE_PATH dan PRIVATE_STORAGE_PATH wajib absolut.",
      );
    this.root = resolve(root);
    const docs = resolve(documentRoot),
      pub = resolve(process.cwd(), "public");
    const overlap = (a: string, b: string) =>
      a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
    if (
      this.root === sep ||
      overlap(this.root, docs) ||
      overlap(this.root, pub)
    )
      throw new Error(
        "Storage laporan harus terpisah dari dokumen domain dan public/.",
      );
    this.storage = new LocalPrivateStorage(this.root);
  }
  async initialize(allowCreate = true) {
    if (allowCreate) await mkdir(this.root, { recursive: true, mode: 0o700 });
    async function canonical(path: string): Promise<string> {
      try {
        return await realpath(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        const parent = resolve(path, "..");
        if (parent === path) throw e;
        return join(await canonical(parent), basename(path));
      }
    }
    const actualRoot = await canonical(this.root),
      actualDocs = await canonical(this.documentRoot),
      actualPublic = await canonical(resolve(process.cwd(), "public"));
    const overlap = (a: string, b: string) =>
      a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
    if (overlap(actualRoot, actualDocs) || overlap(actualRoot, actualPublic))
      throw new Error(
        "Root laporan tidak boleh menunjuk namespace dokumen/public melalui symlink.",
      );
    for (const name of await readdir(this.root)) {
      if (/^[a-f0-9]{2}$/.test(name)) {
        const st = await lstat(join(this.root, name));
        if (!st.isDirectory() || st.isSymbolicLink())
          throw new Error("Prefix storage laporan tidak boleh symlink.");
      }
    }

    const actualDocStat = await lstat(actualDocs).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      },
    );
    const rootStat = await lstat(this.root);
    if (
      actualDocStat &&
      actualDocStat.dev === rootStat.dev &&
      actualDocStat.ino === rootStat.ino
    )
      throw new Error("Volume laporan dan dokumen domain tidak boleh sama.");
    if (
      !(await lstat(this.root)).isDirectory() ||
      (await lstat(this.root)).isSymbolicLink()
    )
      throw new Error("Root laporan tidak boleh symlink.");
    try {
      if ((await readFile(join(this.root, MARKER), "utf8")) !== CONTENT)
        throw new Error("Marker storage tidak valid.");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      if (!allowCreate)
        throw new Error(
          "Marker M7 harus sudah dibuat aplikasi; purger tidak menginisialisasi root.",
        );
      const entries = await readdir(this.root);
      if (entries.length) {
        if (
          (await readFile(join(this.root, MARKER), "utf8").catch(() => "")) ===
          CONTENT
        )
          return;
        throw new Error("Root laporan baru harus kosong.");
      }
      try {
        await writeFile(join(this.root, MARKER), CONTENT, {
          mode: 0o600,
          flag: "wx",
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if ((await readFile(join(this.root, MARKER), "utf8")) !== CONTENT)
          throw error;
      }
    }
  }
  private path(key: string) {
    if (!/^[a-f0-9]{32}$/.test(key))
      throw new Error("Kunci laporan tidak valid.");
    return join(this.root, key.slice(0, 2), key);
  }
  async put(bytes: Uint8Array) {
    await this.initialize();
    const stored = await this.storage.put(bytes);
    await utimes(this.path(stored.key), this.clock(), this.clock());
    return stored;
  }
  async read(key: string, max: number) {
    await this.initialize();
    const path = this.path(key),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max)
      throw new ReportError(
        503,
        "STORAGE_UNAVAILABLE",
        "Berkas laporan tidak valid atau terlalu besar.",
      );
    return this.storage.read(key);
  }
  async delete(key: string) {
    await this.initialize();
    await this.storage.delete(key);
  }
}
