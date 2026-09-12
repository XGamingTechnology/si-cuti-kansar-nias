import type { LeaveRequestRecord, TransitionRecord } from "./ports";

export type LeaveDocumentVariant = "proof" | "approved";

const leaveTypeLabels = {
  ANNUAL: "Cuti Tahunan",
  LARGE: "Cuti Besar",
  SICK: "Cuti Sakit",
  MATERNITY: "Cuti Melahirkan",
  IMPORTANT_REASON: "Cuti Karena Alasan Penting",
  CLTN: "Cuti di Luar Tanggungan Negara",
} as const;

const statusLabels = {
  DRAFT: "DRAF",
  SUBMITTED: "MENUNGGU PERSETUJUAN",
  RETURNED_FOR_CORRECTION: "PERLU PERBAIKAN",
  APPROVED: "DISETUJUI",
  REJECTED: "DITOLAK",
  CANCELLED: "DIBATALKAN",
} as const;

function pdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[\u2013\u2014]/g, "-")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201c\u201d]/g, '"')
    .replaceAll(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function wrap(value: string, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${day} ${monthNames[Number(month) - 1] ?? month} ${year}`;
}

function formatDateTime(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function approval(history: readonly TransitionRecord[]) {
  return [...history].reverse().find((item) => item.toStatus === "APPROVED");
}

type Line = { text: string; x: number; y: number; size?: number; bold?: boolean };
type Box = { x: number; y: number; w: number; h: number; fill?: number };

function createPdf(lines: Line[], boxes: Box[] = []) {
  const pageWidth = 595;
  const pageHeight = 842;
  const commands: string[] = ["q", "0.7 w"];
  for (const box of boxes) {
    if (box.fill !== undefined) {
      const shade = Math.max(0, Math.min(1, box.fill));
      commands.push(`${shade} g ${box.x} ${box.y} ${box.w} ${box.h} re f 0 g`);
    } else commands.push(`${box.x} ${box.y} ${box.w} ${box.h} re S`);
  }
  commands.push("Q");
  for (const line of lines) {
    commands.push(
      "BT",
      `/${line.bold ? "F2" : "F1"} ${line.size ?? 9} Tf`,
      `1 0 0 1 ${line.x} ${line.y} Tm`,
      `(${pdfText(line.text)}) Tj`,
      "ET",
    );
  }
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1)
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

function addWrapped(
  lines: Line[],
  text: string,
  x: number,
  y: number,
  width: number,
  size = 9,
  leading = 12,
) {
  const wrapped = wrap(text, width);
  wrapped.forEach((item, index) =>
    lines.push({ text: item, x, y: y - index * leading, size }),
  );
  return y - wrapped.length * leading;
}

export function generateLeaveDocument(
  request: LeaveRequestRecord,
  history: readonly TransitionRecord[],
  variant: LeaveDocumentVariant,
  generatedAt = new Date(),
) {
  if (variant === "approved" && request.status !== "APPROVED")
    throw new Error("Dokumen persetujuan hanya tersedia untuk pengajuan APPROVED.");

  const revision = request.currentRevision;
  const approved = approval(history);
  const lines: Line[] = [];
  const boxes: Box[] = [];
  const left = 36;
  const right = 559;
  const width = right - left;

  lines.push(
    { text: "BADAN NASIONAL PENCARIAN DAN PERTOLONGAN", x: left, y: 810, size: 9, bold: true },
    { text: "KANTOR SAR NIAS - SI CUTI", x: left, y: 797, size: 12, bold: true },
    {
      text:
        variant === "approved"
          ? "FORMULIR PERMINTAAN DAN PEMBERIAN CUTI"
          : "BUKTI PENGAJUAN CUTI",
      x: left,
      y: 770,
      size: 13,
      bold: true,
    },
    { text: `Status: ${statusLabels[request.status]}`, x: left, y: 752, size: 9, bold: true },
    { text: `ID Pengajuan: ${request.id}`, x: 330, y: 752, size: 8 },
  );

  boxes.push({ x: left, y: 674, w: width, h: 60 });
  lines.push(
    { text: "I. DATA PEGAWAI", x: left + 8, y: 721, size: 9, bold: true },
    { text: `Nama: ${request.employee.fullName}`, x: left + 8, y: 705, size: 9 },
    { text: `NIP: ${request.employee.nip}`, x: 310, y: 705, size: 9 },
    { text: `Jabatan: ${request.employee.positionTitle}`, x: left + 8, y: 689, size: 9 },
    { text: `Unit Kerja: ${request.employee.workUnit}`, x: 310, y: 689, size: 9 },
  );

  boxes.push({ x: left, y: 592, w: width, h: 70 });
  lines.push({ text: "II. JENIS CUTI YANG DIAMBIL", x: left + 8, y: 649, size: 9, bold: true });
  const options = [
    "ANNUAL",
    "LARGE",
    "SICK",
    "MATERNITY",
    "IMPORTANT_REASON",
    "CLTN",
  ] as const;
  options.forEach((type, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    lines.push({
      text: `${revision.leaveType === type ? "[X]" : "[ ]"} ${leaveTypeLabels[type]}`,
      x: left + 8 + col * 255,
      y: 632 - row * 14,
      size: 8.5,
    });
  });

  boxes.push({ x: left, y: 524, w: width, h: 56 });
  lines.push({ text: "III. ALASAN CUTI", x: left + 8, y: 566, size: 9, bold: true });
  addWrapped(lines, revision.reason, left + 8, 548, 92, 8.5, 11);

  boxes.push({ x: left, y: 466, w: width, h: 46 });
  lines.push(
    { text: "IV. LAMANYA CUTI", x: left + 8, y: 498, size: 9, bold: true },
    {
      text: `Hari kerja: ${revision.calculatedWorkingDays ?? "Dihitung saat diajukan"}`,
      x: left + 8,
      y: 480,
      size: 8.5,
    },
    {
      text: `Mulai: ${formatDate(revision.startDate)}  s/d  ${formatDate(revision.endDate)}`,
      x: 220,
      y: 480,
      size: 8.5,
    },
  );

  boxes.push({ x: left, y: 392, w: width, h: 62 });
  lines.push(
    { text: "V. CATATAN CUTI", x: left + 8, y: 440, size: 9, bold: true },
    {
      text:
        revision.leaveType === "ANNUAL"
          ? "Pengurangan saldo tercatat pada ledger SI CUTI sesuai revisi aktif."
          : "Jenis cuti ini tidak menggunakan saldo Cuti Tahunan.",
      x: left + 8,
      y: 421,
      size: 8.5,
    },
    {
      text: "Rincian N / N-1 / N-2 tidak dicetak sebagai snapshot pada versi dokumen ini.",
      x: left + 8,
      y: 407,
      size: 8,
    },
  );

  boxes.push({ x: left, y: 330, w: width, h: 50 });
  lines.push(
    { text: "VI. ALAMAT SELAMA MENJALANKAN CUTI", x: left + 8, y: 366, size: 9, bold: true },
    { text: "Alamat: ______________________________________________", x: left + 8, y: 347, size: 8.5 },
    { text: "Telp: ____________________", x: 375, y: 347, size: 8.5 },
  );

  boxes.push({ x: left, y: 248, w: width, h: 70 });
  lines.push(
    { text: "VII. PERTIMBANGAN ATASAN LANGSUNG", x: left + 8, y: 304, size: 9, bold: true },
    { text: "[ ] DISETUJUI   [ ] PERUBAHAN   [ ] DITANGGUHKAN   [ ] TIDAK DISETUJUI", x: left + 8, y: 285, size: 8 },
    { text: "Nama / tanda tangan atasan langsung mengikuti proses fisik yang berlaku.", x: left + 8, y: 267, size: 8 },
  );

  boxes.push({ x: left, y: 152, w: width, h: 84 });
  lines.push(
    { text: "VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI", x: left + 8, y: 222, size: 9, bold: true },
    {
      text:
        variant === "approved"
          ? "[X] DISETUJUI   [ ] PERUBAHAN   [ ] DITANGGUHKAN   [ ] TIDAK DISETUJUI"
          : "[ ] DISETUJUI   [ ] PERUBAHAN   [ ] DITANGGUHKAN   [ ] TIDAK DISETUJUI",
      x: left + 8,
      y: 203,
      size: 8,
    },
  );

  if (variant === "approved" && approved) {
    lines.push(
      { text: `Dicatat disetujui: ${formatDateTime(approved.occurredAt)}`, x: left + 8, y: 184, size: 8 },
      {
        text: `Referensi bukti: ${approved.evidenceReference ?? "-"}`,
        x: left + 8,
        y: 169,
        size: 8,
      },
    );
  } else {
    lines.push({
      text: "Dokumen ini belum merupakan persetujuan cuti.",
      x: left + 8,
      y: 184,
      size: 8.5,
      bold: true,
    });
  }

  lines.push(
    {
      text:
        "SI CUTI mencatat proses administrasi. Tanda tangan/stempel formal tetap mengikuti proses fisik KANSAR Nias.",
      x: left,
      y: 124,
      size: 7.5,
    },
    { text: `Revisi ${request.currentRevisionNumber} | Dibuat ${formatDateTime(generatedAt)}`, x: left, y: 109, size: 7.5 },
  );

  return createPdf(lines, boxes);
}
