import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DecisionSnapshot } from "./ports";

// A separate status sheet keeps every signature, stamp and line of the source scan visible.
export async function generateDecisionPdf(
  id: string,
  snapshot: DecisionSnapshot,
  scan?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(
    await readFile(join(process.cwd(), "public/fonts/DejaVuSans.ttf")),
    { subset: true },
  );
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const clean = (value: string) =>
    value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ");
  function line(value: string, size = 11, strong = false) {
    const font = strong ? bold : regular;
    for (const paragraph of clean(value).split("\n")) {
      let current = "";
      // Split very long identifiers too, preventing text outside the printable area.
      for (const token of paragraph.match(/.{1,64}(?:\s|$)|\S{1,64}/g) ?? [
        paragraph,
      ]) {
        for (const word of token.trim().split(/\s+/)) {
          const next = current ? current + " " + word : word;
          if (font.widthOfTextAtSize(next, size) > 495 && current) {
            draw(current);
            current = word;
          } else current = next;
        }
      }
      draw(current);
    }
    function draw(text: string) {
      if (y < 70) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(text, { x: 50, y, size, font, color: rgb(0.1, 0.2, 0.27) });
      y -= size + 7;
    }
  }
  line("SI CUTI", 22, true);
  line("Kantor Pencarian dan Pertolongan Kelas B Nias", 12);
  y -= 18;
  line(
    snapshot.status === "APPROVED"
      ? "FINAL - DISETUJUI DI SI CUTI"
      : "DITOLAK DI SI CUTI",
    18,
    true,
  );
  line("Ringkasan pencatatan keputusan administratif", 11);
  y -= 16;
  line("ID arsip sistem: " + id);
  line("ID pengajuan: " + snapshot.requestId);
  line("Revisi: " + snapshot.revisionNumber);
  line("Pegawai: " + snapshot.employeeName);
  line("NIP: " + snapshot.employeeNip);
  const leaveLabels: Record<string, string> = {
    ANNUAL: "Cuti Tahunan",
    SICK: "Cuti Sakit",
    IMPORTANT_REASON: "Cuti Alasan Penting",
    LARGE: "Cuti Besar",
    MATERNITY: "Cuti Melahirkan",
    CLTN: "Cuti di Luar Tanggungan Negara (CLTN)",
  };
  line(
    "Jenis cuti: " + (leaveLabels[snapshot.leaveType] ?? snapshot.leaveType),
  );
  line("ID pegawai: " + snapshot.employeeId);
  line("Periode: " + snapshot.startDate + " s.d. " + snapshot.endDate);
  line("Keputusan dicatat: " + snapshot.occurredAt + " (UTC)");
  line("Admin pencatat: " + snapshot.actorName);
  line("ID Admin: " + snapshot.actorUserId);
  if (snapshot.sourceReview) {
    line("Verifikasi arsip lama: " + snapshot.sourceReview.actorName);
    line(
      "Tanggal verifikasi arsip: " +
        snapshot.sourceReview.reviewedAt +
        " (UTC)",
    );
    line(
      "Identitas historis yang tidak tersimpan dirujuk ke scan sumber, bukan data pegawai saat ini.",
      9,
    );
  }
  if (snapshot.evidenceReference)
    line("Referensi administrasi: " + snapshot.evidenceReference);
  if (snapshot.reason) {
    y -= 12;
    line("Alasan penolakan:", 12, true);
    line(snapshot.reason);
  }
  if (snapshot.sourceDocumentVersion !== null)
    line("Versi scan sumber: " + snapshot.sourceDocumentVersion);
  if (snapshot.sourceChecksumSha256)
    line("SHA-256 scan sumber: " + snapshot.sourceChecksumSha256, 8);
  y -= 16;
  line(
    "ID arsip ini adalah identitas SI CUTI, bukan nomor surat kedinasan.",
    9,
  );
  line(
    "Penanda sistem tidak menggantikan tanda tangan atau cap pada dokumen sumber.",
    9,
  );
  if (scan) {
    const source = await PDFDocument.load(scan);
    const pages = await pdf.copyPages(source, source.getPageIndices());
    for (const copied of pages) pdf.addPage(copied);
  } else
    line(
      "Tidak ada scan sumber yang diunggah pada saat keputusan penolakan.",
      9,
    );
  pdf.setTitle(
    snapshot.status === "APPROVED"
      ? "Arsip Final Cuti Disetujui"
      : "Hasil Penolakan Cuti",
  );
  pdf.setSubject("ID arsip SI CUTI " + id);
  pdf.setCreationDate(new Date(snapshot.occurredAt));
  pdf.setModificationDate(new Date(snapshot.occurredAt));
  return pdf.save();
}
