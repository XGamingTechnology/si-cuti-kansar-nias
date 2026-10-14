import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { DecisionPlacement, DecisionSnapshot } from "./ports";

export function validateDecisionPlacement(value: unknown): DecisionPlacement {
  const p = value as DecisionPlacement | null;
  if (
    !p ||
    !Number.isInteger(p.page) ||
    p.page < 1 ||
    ![p.left, p.top, p.width, p.height].every(Number.isFinite) ||
    p.left < 0 ||
    p.top < 0 ||
    p.width < 0.15 ||
    p.width > 0.6 ||
    p.height < 0.055 ||
    p.height > 0.2 ||
    p.left + p.width > 1 ||
    p.top + p.height > 1
  )
    throw new Error("Posisi penanda tidak valid atau melewati batas halaman.");
  return {
    page: p.page,
    left: p.left,
    top: p.top,
    width: p.width,
    height: p.height,
  };
}
export function decisionTime(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)) + " WIB"
  );
}
const date = (v: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(v + "T12:00:00Z"));
const labels: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Cuti Sakit",
  IMPORTANT_REASON: "Cuti Alasan Penting",
  LARGE: "Cuti Besar",
  MATERNITY: "Cuti Melahirkan",
  CLTN: "Cuti di Luar Tanggungan Negara (CLTN)",
};

export async function generateDecisionPdf(
  id: string,
  snapshot: DecisionSnapshot,
  scan?: Uint8Array,
  rawPlacement?: DecisionPlacement,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(join(process.cwd(), "public/fonts/DejaVuSans.ttf")),
    { subset: true },
  );
  const approved = snapshot.status === "APPROVED";
  const color = approved ? rgb(0.08, 0.37, 0.27) : rgb(0.65, 0.16, 0.18);
  const ink = rgb(0.1, 0.17, 0.23),
    muted = rgb(0.35, 0.4, 0.45);
  const textLines = (text: string, width: number, size: number) => {
    const result: string[] = [];
    for (const paragraph of text
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
      .split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (
          font.widthOfTextAtSize(line ? line + " " + word : word, size) <= width
        ) {
          line = line ? line + " " + word : word;
          continue;
        }
        if (line) {
          result.push(line);
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width && line) {
            result.push(line);
            line = "";
          }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  };
  const source = scan ? await PDFDocument.load(scan) : null;
  if (rawPlacement && !source) throw new Error("Scan sumber tidak tersedia.");
  const placement = rawPlacement
    ? validateDecisionPlacement(rawPlacement)
    : null;
  if (placement && placement.page > source!.getPageCount())
    throw new Error("Halaman penanda tidak tersedia.");
  const sourcePages = source
    ? await pdf.copyPages(source, source.getPageIndices())
    : [];
  if (placement) {
    sourcePages.forEach((p) => pdf.addPage(p));
    const target = sourcePages[placement.page - 1];
    const crop = target.getCropBox();
    const angle = ((target.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(angle))
      throw new Error("Rotasi scan tidak didukung.");
    const visibleW = angle % 180 ? crop.height : crop.width;
    const visibleH = angle % 180 ? crop.width : crop.height;
    const w = visibleW * placement.width,
      h = visibleH * placement.height;
    const stamp = await PDFDocument.create();
    stamp.registerFontkit(fontkit);
    const stampFont = await stamp.embedFont(
      await readFile(join(process.cwd(), "public/fonts/DejaVuSans.ttf")),
      { subset: true },
    );
    const box = stamp.addPage([w, h]);
    box.drawRectangle({
      x: 1,
      y: 1,
      width: w - 2,
      height: h - 2,
      borderWidth: 1.1,
      borderColor: color,
    });
    const lines = [
      approved ? "DISETUJUI" : "TIDAK DISETUJUI",
      "DI SI CUTI",
      new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(snapshot.occurredAt)) + " WIB",
      "Arsip " + id.slice(0, 8).toUpperCase(),
    ];
    if (!approved) lines.push("Alasan: lihat keterangan keputusan");
    let y = h - 10;
    for (const [i, line] of lines.entries()) {
      const size = Math.min(
        i === 0 ? 9 : 7,
        (w - 10) / stampFont.widthOfTextAtSize(line, 1),
        (h - 12) / lines.length - 1,
      );
      if (size < 5)
        throw new Error(
          "Penanda terlalu kecil. Perbesar lebar/tinggi pada preview.",
        );
      box.drawText(line, { x: 5, y, size, font: stampFont, color });
      y -= (h - 12) / lines.length;
    }
    const [embedded] = await pdf.embedPdf(await stamp.save(), [0]);
    const left = visibleW * placement.left,
      top = visibleH * placement.top;
    const origin =
      angle === 0
        ? [left, crop.height - top - h]
        : angle === 90
          ? [top + h, left]
          : angle === 180
            ? [crop.width - left, top + h]
            : [crop.width - top - h, crop.height - left];
    target.drawPage(embedded, {
      x: crop.x + origin[0],
      y: crop.y + origin[1],
      width: w,
      height: h,
      rotate: degrees(angle),
    });
  }
  let page = pdf.addPage([595, 842]),
    y = 790;
  function header() {
    page.drawRectangle({ x: 0, y: 825, width: 595, height: 17, color });
    page.drawText("SI CUTI", { x: 42, y: 790, size: 20, font, color: ink });
    page.drawText("Kantor Pencarian dan Pertolongan Kelas B Nias", {
      x: 42,
      y: 770,
      size: 10,
      font,
      color: muted,
    });
    y = 725;
  }
  function ensure(height: number) {
    if (y - height < 85) {
      page = pdf.addPage([595, 842]);
      header();
    }
  }
  function paragraph(text: string, size = 10, indent = 42, width = 511) {
    for (const line of textLines(text, width, size)) {
      ensure(size + 7);
      page.drawText(line, { x: indent, y, size, font, color: ink });
      y -= size + 7;
    }
  }
  function row(label: string, value: string) {
    const lines = textLines(value, 340, 10),
      height = Math.max(31, lines.length * 15 + 12);
    ensure(height);
    page.drawRectangle({
      x: 42,
      y: y - height + 9,
      width: 511,
      height,
      color: rgb(0.96, 0.97, 0.98),
    });
    page.drawText(label, { x: 52, y: y - 8, size: 9, font, color: muted });
    for (const [i, line] of lines.entries())
      page.drawText(line, {
        x: 205,
        y: y - 8 - i * 15,
        size: 10,
        font,
        color: ink,
      });
    y -= height + 3;
  }
  header();
  paragraph(approved ? "HASIL PERSETUJUAN CUTI" : "HASIL PENOLAKAN CUTI", 18);
  paragraph(approved ? "DISETUJUI DI SI CUTI" : "DITOLAK DI SI CUTI", 11);
  y -= 16;
  row("Pegawai", snapshot.employeeName);
  row("NIP", snapshot.employeeNip);
  row("Jenis cuti", labels[snapshot.leaveType] ?? snapshot.leaveType);
  row("Periode", date(snapshot.startDate) + " s.d. " + date(snapshot.endDate));
  row("Keputusan dicatat", decisionTime(snapshot.occurredAt));
  row("Admin pencatat", snapshot.actorName);
  if (snapshot.evidenceReference)
    row("Referensi administrasi", snapshot.evidenceReference);
  if (snapshot.sourceDocumentVersion !== null)
    row("Formulir sumber", "Versi " + snapshot.sourceDocumentVersion);
  if (snapshot.reason) {
    y -= 14;
    paragraph("ALASAN PENOLAKAN", 12);
    paragraph(snapshot.reason);
  }
  if (snapshot.sourceReview) {
    y -= 12;
    paragraph(
      "Verifikasi arsip lama: " +
        snapshot.sourceReview.actorName +
        ", " +
        decisionTime(snapshot.sourceReview.reviewedAt),
      9,
    );
    paragraph(
      "Identitas historis yang tidak tersimpan dirujuk ke formulir sumber.",
      9,
    );
  }
  y -= 18;
  paragraph(
    "Dokumen ini merupakan salinan arsip keputusan yang dicatat melalui SI CUTI. Penanda SI CUTI tidak menggantikan tanda tangan dan cap pada formulir sumber.",
    9,
  );
  if (!source)
    paragraph(
      "Tidak ada scan sumber yang diunggah pada saat keputusan penolakan.",
      9,
    );
  paragraph("Referensi arsip: " + id, 8);
  if (!placement) sourcePages.forEach((p) => pdf.addPage(p));
  pdf.getPages().forEach((p, i) => {
    if (sourcePages.includes(p)) return;
    p.drawText(
      "SI CUTI | Arsip " +
        id.slice(0, 8).toUpperCase() +
        " | " +
        (i + 1) +
        "/" +
        pdf.getPageCount(),
      {
        x: p.getCropBox().x + 8,
        y: p.getCropBox().y + 4,
        size: 6,
        font,
        color: muted,
        rotate: degrees(p.getRotation().angle),
      },
    );
  });
  pdf.setTitle(
    approved ? "Arsip Final Cuti Disetujui" : "Hasil Penolakan Cuti",
  );
  pdf.setCreationDate(new Date(snapshot.occurredAt));
  pdf.setModificationDate(new Date(snapshot.occurredAt));
  return pdf.save();
}
