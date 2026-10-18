/** Documentation artifact generator. Does not start the app or access any DB. */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(
  process.argv[2] || "/workspace/output/si-cuti-user-guides-2026-10-18",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.SI_CUTI_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const css = `
@page { size: A4 portrait; margin: 18mm 18mm 20mm; }
@page screen { size: A3 landscape; margin: 14mm 14mm 18mm; }
body { max-width: none; margin: 0; padding: 0; font: 11pt/1.48 "DejaVu Sans", Arial, sans-serif; color: #182d42; }
h1 { font-size: 27pt; color: #103b55; border-bottom: 3pt solid #1f7694; padding-bottom: 7mm; }
h2 { font-size: 19pt; color: #103b55; break-before: page; }
h3 { font-size: 14pt; color: #1b5c75; }
h1,h2,h3 { break-after: avoid; }
p,li { orphans: 3; widows: 3; }
a { color: #175e84; overflow-wrap: anywhere; }
code { font: 8pt monospace; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; table-layout: fixed; }
th,td { border: 0.3mm solid #d4dfe6; padding: 2mm; overflow-wrap: anywhere; }
th { background: #eaf1f5; text-align: left; }
tr { break-inside: avoid; } thead { display: table-header-group; }
figure { page: screen; break-before: page; break-after: page; margin: 0; text-align: center; }
figure img { display: block; margin: 0 auto 2mm; max-width: 385mm; max-height: 240mm; width: auto; height: auto; }
figcaption { font-size: 10pt; color: #27495d; }
`;
try {
  for (const name of ["pegawai", "admin"]) {
    const stem = `panduan-${name}`;
    const markdown = resolve(root, `${stem}.md`);
    execFileSync("pandoc", [
      markdown,
      "--from=gfm",
      "--to=docx",
      "--resource-path",
      root,
      "--output",
      resolve(output, `${stem}.docx`),
    ]);
    execFileSync("python", [
      resolve(root, "tools/artifacts.py"),
      "style",
      resolve(output, `${stem}.docx`),
    ]);
    let html = execFileSync(
      "pandoc",
      [
        markdown,
        "--from=gfm",
        "--to=html5",
        "--standalone",
        "--metadata",
        `title=SI CUTI — Panduan ${name}`,
        "--resource-path",
        root,
      ],
      { encoding: "utf8" },
    );
    html = html.replace(
      /<p><img([^>]+)><\/p>\s*<p><em>(Gambar [^<]*?)<\/em><\/p>/g,
      "<figure><img$1><figcaption>$2</figcaption></figure>",
    );
    html = html.replace(
      /<header id="title-block-header">[\s\S]*?<\/header>/,
      "",
    );
    // Keep each procedure and its notes together before its gallery, avoiding orphan note pages.
    let pendingFigures = [];
    html = html
      .split(/(<figure>[\s\S]*?<\/figure>)/g)
      .map((part) => {
        if (part.startsWith("<figure>")) {
          pendingFigures.push(part);
          return "";
        }
        if (pendingFigures.length && /<h[23]\b|<\/body>/.test(part)) {
          const pictures = pendingFigures.join("\n");
          pendingFigures = [];
          return part.replace(/(?=<h[23]\b|<\/body>)/, pictures);
        }
        return part;
      })
      .join("");
    html = html.replaceAll(
      'src="screenshots/',
      `src="${pathToFileURL(resolve(root, "screenshots")).href}/`,
    );
    html = html.replace("</head>", `<style>${css}</style></head>`);
    const htmlFile = resolve(output, `${stem}.html`);
    await writeFile(htmlFile, html);
    const page = await browser.newPage();
    await page.setContent(await inlineImages(html), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
    });
    const stats = await page.evaluate(() => ({
      images: document.images.length,
      figures: document.querySelectorAll("figure").length,
    }));
    if (stats.images !== stats.figures)
      throw new Error("Figure conversion incomplete");
    await page.pdf({
      path: resolve(output, `${stem}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font:8px Arial;width:100%;text-align:center;color:#526474">SI CUTI · Panduan 1.0 · Data contoh lokal · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    // Content round-trip preview; explicitly NOT a native Word layout render.
    let preview = execFileSync(
      "pandoc",
      [
        resolve(output, `${stem}.docx`),
        "--to=html5",
        "--standalone",
        `--extract-media=${resolve(output, `${stem}-docx-media`)}`,
      ],
      { encoding: "utf8" },
    );
    preview = preview.replace(
      "</head>",
      `<style>${css} img {max-width:100%;max-height:230mm;object-fit:contain} </style></head>`,
    );
    const previewFile = resolve(output, `${stem}-docx-content-preview.html`);
    await writeFile(previewFile, preview);
    await page.setContent(await inlineImages(preview), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
    });
    await page.pdf({
      path: resolve(output, `${stem}-docx-content-preview.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.close();
    console.log(`${stem}: PDF/DOCX created, ${stats.images} figures`);
  }
} finally {
  await browser.close();
}
execFileSync(
  "python",
  [resolve(root, "tools/artifacts.py"), "validate", output],
  { stdio: "inherit" },
);

async function inlineImages(html) {
  const matches = [...html.matchAll(/src="([^"]+)"/g)];
  for (const match of matches) {
    const path = match[1].startsWith("file:")
      ? fileURLToPath(match[1])
      : match[1];
    const bytes = await readFile(path);
    html = html.replace(
      match[0],
      `src="data:image/png;base64,${bytes.toString("base64")}"`,
    );
  }
  return html;
}
