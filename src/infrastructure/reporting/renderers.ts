import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { crc32 } from "node:zlib";
import {
  ReportError,
  summary,
  checksum,
  MAX_ARTIFACT,
  type Dataset,
  type Format,
  type ReportRenderers,
} from "@/application/reporting/contracts";
import { formatDate, formatDateTime } from "@/components/indonesian-date";
export const statusLabel: Record<string, string> = {
  SUBMITTED: "Diajukan",
  RETURNED_FOR_CORRECTION: "Perlu diperbaiki",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  ALL_NON_DRAFT: "Semua non-draf",
};
export const title = (d: Dataset) =>
  d.filters.reportCode === "LEAVE_REQUESTS"
    ? "Rekap Pengajuan Cuti"
    : "Rekap Izin";
export function isoWIB(v: string | null) {
  if (!v) return "";
  return new Date(new Date(v).getTime() + 7 * 3600000)
    .toISOString()
    .replace(/Z$/, "+07:00");
}
const deadlineCheck = (deadline: number) => {
  if (performance.now() > deadline)
    throw new ReportError(
      503,
      "RENDER_TIMEOUT",
      "Waktu render terlampaui. Persempit filter.",
    );
};
function lines(value: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    // Wrap by words where possible, then by code point for unbroken identifiers.
    for (const token of paragraph.split(/(\s+)/)) {
      if (font.widthOfTextAtSize(line + token, size) <= width) {
        line += token;
        continue;
      }
      if (line.trim()) {
        out.push(line.trimEnd());
        line = "";
      }
      for (const char of token) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) {
          out.push(line);
          line = "";
        }
        line += char;
      }
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [""];
}
export async function renderReportPDF(
  d: Dataset,
  options: { maxPages?: number; timeoutMs?: number } = {},
) {
  const deadline = performance.now() + (options.timeoutMs ?? 20000),
    doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(join(process.cwd(), "public/fonts/DejaVuSans.ttf")),
    { subset: true },
  );
  const mm = 72 / 25.4,
    W = 297 * mm,
    H = 210 * mm,
    margin = 12 * mm;
  const leave = d.filters.reportCode === "LEAVE_REQUESTS";
  const widths = (
    leave ? [10, 51, 27, 30, 43, 34, 16, 30, 32] : [10, 52, 38, 40, 55, 56, 22]
  ).map((v) => v * mm);
  const headings = leave
    ? [
        "No.",
        "Nama / NIP",
        "Unit kerja kini",
        "Jenis cuti",
        "Periode penuh",
        "Status kini",
        "Revisi",
        "Hari kerja tahunan (revisi)",
        "Ada pengembalian saldo",
      ]
    : [
        "No.",
        "Nama / NIP",
        "Unit kerja kini",
        "Jenis izin",
        "Periode penuh",
        "Status kini",
        "Revisi",
      ];
  let page!: PDFPage,
    y = 0;
  function text(p: PDFPage, value: string, x: number, top: number, size = 9) {
    p.drawText(value, {
      x,
      y: top - size,
      font,
      size,
      color: rgb(0.12, 0.2, 0.26),
    });
  }
  function newPage() {
    deadlineCheck(deadline);
    if (doc.getPageCount() >= (options.maxPages ?? 100))
      throw new ReportError(
        422,
        "PDF_TOO_LARGE",
        "PDF melebihi batas halaman. Persempit filter.",
      );
    page = doc.addPage([W, H]);
    y = H - margin;
    const meta = [
      "SI CUTI — Kantor Pencarian dan Pertolongan Kelas B Nias",
      title(d),
      `Periode: ${formatDate(d.filters.from)} — ${formatDate(d.filters.to)} | Periode beririsan`,
      `Status: ${statusLabel[d.filters.status]} | Jenis: ${d.filterLabels?.type ?? d.filters.type ?? "Semua"} | Keaktifan: ${{ all: "Semua, termasuk nonaktif", active: "Aktif", inactive: "Nonaktif" }[d.filters.activeState]}`,
      `Pegawai: ${d.filterLabels?.employee ?? d.filters.employeeId ?? "Semua"} | Cari: ${d.filters.search || "—"} | Unit: ${d.filters.workUnit ?? "Semua"}`,
      `Data dibaca: ${formatDateTime(d.capturedAt)} | Identitas: master saat snapshot | ${d.definitionVersion}`,
      `Dataset: ${checksum(Buffer.from(JSON.stringify(d)))} | Renderer: ${d.rendererVersion}`,
    ];
    meta.forEach((m, i) => {
      for (const l of lines(m, font, i === 1 ? 13 : 9, W - margin * 2)) {
        text(page, l, margin, y, i === 1 ? 13 : 9);
        y -= i === 1 ? 18 : 12;
      }
    });
    y -= 8;
    const cells = headings.map((h, i) => lines(h, font, 9, widths[i] - 8)),
      height = Math.max(...cells.map((c) => c.length)) * 12 + 8;
    let x = margin;
    cells.forEach((c, i) => {
      page.drawRectangle({
        x,
        y: y - height,
        width: widths[i],
        height,
        color: rgb(0.92, 0.95, 0.97),
      });
      c.forEach((l, n) => text(page, l, x + 4, y - 4 - n * 12));
      x += widths[i];
    });
    y -= height;
    if (y < 150)
      throw new ReportError(
        422,
        "PDF_ROW_TOO_TALL",
        "Metadata terlalu panjang untuk halaman A4.",
      );
  }
  newPage();
  for (const [i, r] of d.rows.entries()) {
    deadlineCheck(deadline);
    const data = [
      String(i + 1),
      `${r.name}\n${r.nip}`,
      r.workUnit,
      r.typeLabel,
      `${formatDate(r.startDate)}\n— ${formatDate(r.endDate)}`,
      statusLabel[r.status] ?? r.status,
      String(r.revisionNumber),
      ...(leave
        ? [
            r.workingDays === null ? "—" : String(r.workingDays),
            r.hasBalanceReturn ? "Ya" : "Tidak",
          ]
        : []),
    ];
    const cells = data.map((v, n) => lines(v, font, 9, widths[n] - 8)),
      height = Math.max(...cells.map((v) => v.length)) * 12 + 10;
    if (height > 220)
      throw new ReportError(
        422,
        "PDF_ROW_TOO_TALL",
        "Satu baris terlalu tinggi untuk halaman A4; isi tidak dipotong.",
      );
    if (y - height < 105) newPage();
    if (y - height < 105)
      throw new ReportError(
        422,
        "PDF_ROW_TOO_TALL",
        "Baris dan metadata terlalu tinggi untuk halaman A4.",
      );
    let x = margin;
    cells.forEach((c, n) => {
      c.forEach((l, k) => text(page, l, x + 4, y - 5 - k * 12));
      x += widths[n];
    });
    page.drawLine({
      start: { x: margin, y: y - height },
      end: { x: W - margin, y: y - height },
      color: rgb(0.82, 0.87, 0.9),
      thickness: 0.4,
    });
    y -= height;
  }
  const counts = summary(d.rows);
  if (y < 140) newPage();
  const notes = [
    `${counts.requests} pengajuan | ${counts.employees} pegawai unik${leave ? ` | ${counts.withBalanceReturn} pengajuan memiliki pengembalian saldo` : ""}`,
    ...(!d.rows.length ? ["Tidak ada pengajuan sesuai filter."] : []),
    ...(leave
      ? [
          "Hari kerja tahunan adalah nilai tersimpan untuk seluruh revisi, bukan hari aktual/periode filter.",
          "Pengembalian tidak mengubah periode persetujuan; tanggal penggunaan aktual tidak ditentukan.",
        ]
      : []),
    "Status saat snapshot, bukan status historis akhir periode. Laporan administratif, bukan surat keputusan.",
    ...counts.groups.map(
      (g) =>
        `${g.typeLabel} / ${statusLabel[g.status] ?? g.status}: ${g.count} pengajuan`,
    ),
  ];
  y -= 8;
  for (const n of notes) {
    for (const l of lines(n, font, 9, W - margin * 2)) {
      if (y < 70) newPage();
      text(page, l, margin, y);
      y -= 12;
    }
  }
  doc.getPages().forEach((p, i) => {
    text(
      p,
      `ID internal: ${d.runId} | Halaman ${i + 1} dari ${doc.getPageCount()}`,
      margin,
      margin + 14,
      8,
    );
  });
  doc.setTitle(title(d));
  doc.setSubject(`Snapshot ${d.runId} ${d.definitionVersion}`);
  doc.setCreationDate(new Date(d.capturedAt));
  doc.setModificationDate(new Date(d.capturedAt));
  const bytes = await doc.save();
  deadlineCheck(deadline);
  if (bytes.length > MAX_ARTIFACT)
    throw new ReportError(422, "ARTIFACT_TOO_LARGE", "PDF terlalu besar.");
  return bytes;
}
const xml = (v: string | number) =>
  String(v)
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export function columnName(i: number) {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
// Minimal OOXML packaging follows the existing balance template writer. No formula, macro,
// external relationship or inferred hyperlink is ever emitted, even for = + - @ prefixes.
export function workbook(
  sheets: { name: string; rows: (string | number | null)[][] }[],
) {
  const files: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((s, i) => `<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xml(s.name)}'!$A$1:$${columnName(s.rows[0].length - 1)}$${Math.max(1, s.rows.length)}</definedName>`).join("")}</definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="10"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  sheets.forEach((s, i) => {
    const last = columnName(s.rows[0].length - 1);
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${s.rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${s.rows[0].length}" width="24" customWidth="1"/></cols><sheetData>${s.rows.map((row, n) => `<row r="${n + 1}">${row.map((v, c) => (v === null ? `<c r="${columnName(c)}${n + 1}"/>` : typeof v === "number" ? `<c r="${columnName(c)}${n + 1}"><v>${v}</v></c>` : `<c r="${columnName(c)}${n + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${last}${s.rows.length}"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  });
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = Buffer.from(path),
      data = Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`,
      ),
      crc = crc32(data),
      local = Buffer.alloc(30),
      entry = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(sheets.length + 5, 8);
  end.writeUInt16LE(sheets.length + 5, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}
export function renderReportXLSX(d: Dataset) {
  const leave = d.filters.reportCode === "LEAVE_REQUESTS",
    s = summary(d.rows);
  const headers = [
    "No.",
    "Request ID",
    "Revision ID",
    "Nomor revisi",
    "Employee ID",
    "NIP",
    "Nama",
    "Unit kerja kini",
    "Keaktifan kini",
    ...(leave ? ["Jenis cuti"] : ["Kode jenis izin", "Nama jenis izin kini"]),
    "Mulai",
    "Selesai",
    "Status kini",
    "Diajukan pada WIB",
    ...(leave ? ["Hari kerja tahunan (revisi)", "Ada pengembalian saldo"] : []),
  ];
  const rows = d.rows.map((r, i) => [
    i + 1,
    r.requestId,
    r.revisionId,
    r.revisionNumber,
    r.employeeId,
    r.nip,
    r.name,
    r.workUnit,
    r.active ? "Aktif" : "Nonaktif",
    ...(leave ? [r.typeLabel] : [r.typeCode, r.typeLabel]),
    r.startDate,
    r.endDate,
    statusLabel[r.status] ?? r.status,
    isoWIB(r.submittedAt) || null,
    ...(leave ? [r.workingDays, r.hasBalanceReturn ? "Ya" : "Tidak"] : []),
  ]);
  return workbook([
    {
      name: "Metadata",
      rows: [
        ["Field", "Nilai"],
        ["ID internal", d.runId],
        ["Laporan", title(d)],
        ["Definisi", d.definitionVersion],
        ["Renderer", d.rendererVersion],
        ["Checksum dataset", checksum(Buffer.from(JSON.stringify(d)))],
        ["Data dibaca WIB", isoWIB(d.capturedAt)],
        ["Data dibaca UTC", d.capturedAt],
        ["Filter", JSON.stringify(d.filters)],
        ["Pegawai filter", d.filterLabels?.employee ?? "Semua"],
        ["Jenis filter", d.filterLabels?.type ?? "Semua"],
        ["Basis tanggal", "Periode beririsan inklusif"],
        ["Scope", "Admin pembuat; seluruh filter administratif"],
        ["Identitas", "Master saat snapshot"],
        ["Status", "Saat snapshot, bukan historis akhir periode"],
        [
          "Tanggal",
          "DATE dan timestamp ISO adalah teks; timestamp Asia/Jakarta +07:00",
        ],
        ["Baris", d.rows.length],
        [
          "Makna hari",
          "Nilai revisi penuh, bukan penggunaan aktual; tidak diprorata/dikurangi pengembalian",
        ],
      ],
    },
    { name: "Data", rows: [headers, ...rows] },
    {
      name: "Ringkasan",
      rows: [
        ["Indikator", "Jumlah"],
        ["Pengajuan", s.requests],
        ["Pegawai unik", s.employees],
        ...(leave
          ? [
              ["Pengajuan dengan pengembalian saldo", s.withBalanceReturn] as (
                | string
                | number
              )[],
            ]
          : []),
        ["Jenis / Status", "Pengajuan"],
        ...s.groups.map((g) => [
          `${g.typeLabel} / ${statusLabel[g.status] ?? g.status}`,
          g.count,
        ]),
      ],
    },
  ]);
}
export class ReportRenderersAdapter implements ReportRenderers {
  async render(format: Format, d: Dataset) {
    return format === "PDF" ? renderReportPDF(d) : renderReportXLSX(d);
  }
}
