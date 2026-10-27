// Ship PDF.js assets with the application; never fetch a renderer from a CDN.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(process.cwd(), "public", "pdfjs");
await mkdir(target, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(join(source, directory), join(target, directory), {
    recursive: true,
  });
}
await cp(
  join(source, "build/pdf.worker.min.mjs"),
  join(target, "pdf.worker.min.mjs"),
);
await cp(join(source, "LICENSE"), join(target, "LICENSE"));
