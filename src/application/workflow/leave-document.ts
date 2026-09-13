import type { LeaveRequestRecord, TransitionRecord } from "./ports";

/** Both variants are the same submitted, pre-signature form. */
export type LeaveDocumentVariant = "proof" | "approved";
export type AnnualLeaveFormBalance = Readonly<{
  bucket: "N" | "N1" | "N2";
  remainingDays: number;
  allocatedDays?: number;
}>;
export type LeaveFormOptions = Readonly<{
  annualBalances?: readonly AnnualLeaveFormBalance[];
  authorizedOfficial?: Readonly<{ fullName: string; nip: string }> | null;
}>;

const months = [
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

function date(value: string | Date) {
  const iso =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`;
}

export function calculateIndonesianTenure(
  start: string | null,
  submittedAt: Date,
) {
  if (!start) return "Belum tersedia";
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(
    Date.UTC(
      submittedAt.getUTCFullYear(),
      submittedAt.getUTCMonth(),
      submittedAt.getUTCDate(),
    ),
  );
  if (from > to) return "Belum tersedia";
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let monthsCount = to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) monthsCount -= 1;
  if (monthsCount < 0) {
    years -= 1;
    monthsCount += 12;
  }
  return (
    [years ? `${years} Tahun` : "", monthsCount ? `${monthsCount} Bulan` : ""]
      .filter(Boolean)
      .join(" ") || "0 Bulan"
  );
}

function escape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^ -~ -ÿ]/g, "?");
}
type Text = {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
};
type Box = { x: number; y: number; w: number; h: number };

function pdf(texts: Text[], boxes: Box[]) {
  const commands = [
    "q",
    "0 G",
    "0.45 w",
    ...boxes.map((box) => `${box.x} ${box.y} ${box.w} ${box.h} re S`),
    "Q",
  ];
  for (const item of texts)
    commands.push(
      "BT",
      `/${item.bold ? "F2" : "F1"} ${item.size ?? 7} Tf`,
      `1 0 0 1 ${item.x} ${item.y} Tm`,
      `(${escape(item.text)}) Tj`,
      "ET",
    );
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += "xref\n0 7\n0000000000 65535 f \n";
  for (let index = 1; index <= 6; index++)
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

function addText(
  texts: Text[],
  value: string,
  x: number,
  y: number,
  bold = false,
  size = 7,
) {
  texts.push({ text: value, x, y, bold, size });
}
function addCell(
  boxes: Box[],
  texts: Text[],
  x: number,
  y: number,
  w: number,
  h: number,
  value?: string,
  bold = false,
  size = 7,
) {
  boxes.push({ x, y, w, h });
  if (value) addText(texts, value, x + 3, y + h - size - 3, bold, size);
}
function wrap(
  texts: Text[],
  value: string,
  x: number,
  top: number,
  width: number,
  maxLines: number,
  size = 7,
  bold = false,
) {
  const maxChars = Math.max(5, Math.floor(width / (size * 0.52)));
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  lines
    .slice(0, maxLines)
    .forEach((item, index) =>
      addText(texts, item, x, top - index * (size + 2), bold, size),
    );
}

export function generateLeaveDocument(
  request: LeaveRequestRecord,
  _history: readonly TransitionRecord[],
  _variant: LeaveDocumentVariant = "proof",
  _generatedAt = new Date(),
  options: LeaveFormOptions = {},
) {
  void _history;
  void _variant;
  void _generatedAt;
  const revision = request.currentRevision;
  if (!revision.submittedAt)
    throw new Error(
      "Formulir hanya tersedia untuk revisi yang telah diajukan.",
    );
  const texts: Text[] = [];
  const boxes: Box[] = [];
  const left = 32,
    width = 531;

  addText(
    texts,
    `${revision.formPlace ?? "Tempat belum tersedia"}, ${date(revision.submittedAt)}`,
    360,
    814,
    false,
    8,
  );
  addText(texts, "Kepada", 360, 800);
  addText(texts, "Yth.", 360, 790);
  addText(
    texts,
    "Kepala Kantor Pencarian dan Pertolongan Kelas B Nias",
    378,
    780,
    false,
    6.5,
  );
  addText(texts, "Di", 360, 770);
  addText(texts, "Gunungsitoli", 378, 760, true);
  addText(
    texts,
    "FORMULIR PERMINTAAN DAN PEMBERIAN CUTI",
    166,
    738,
    true,
    10.5,
  );

  const header = (label: string, y: number) =>
    addCell(boxes, texts, left, y, width, 16, label, true, 7);

  header("I. DATA PEGAWAI", 710);
  const rows = [
    ["Nama", request.employee.fullName, "NIP", request.employee.nip],
    [
      "Jabatan",
      request.employee.positionTitle,
      "Masa Kerja",
      calculateIndonesianTenure(
        request.employee.employmentStartDate ?? null,
        revision.submittedAt,
      ),
    ],
  ];
  rows.forEach((row, index) => {
    const y = 686 - index * 24;
    addCell(boxes, texts, left, y, 55, 24, row[0], true);
    addCell(boxes, texts, left + 55, y, 210, 24, row[1]);
    addCell(boxes, texts, left + 265, y, 65, 24, row[2], true);
    addCell(boxes, texts, left + 330, y, 201, 24, row[3]);
  });
  addCell(boxes, texts, left, 638, 55, 24, "Unit Kerja", true);
  addCell(boxes, texts, left + 55, 638, 476, 24);
  wrap(texts, request.employee.workUnit, left + 58, 651, 468, 2);

  header("II. JENIS CUTI YANG DIAMBIL", 622);
  const leaveTypes = [
    [
      ["ANNUAL", "1. Cuti Tahunan"],
      ["LARGE", "2. Cuti Besar"],
    ],
    [
      ["SICK", "3. Cuti Sakit"],
      ["MATERNITY", "4. Cuti Melahirkan"],
    ],
    [
      ["IMPORTANT_REASON", "5. Cuti Karena Alasan Penting"],
      ["CLTN", "6. Cuti di Luar Tanggungan Negara"],
    ],
  ] as const;
  leaveTypes.forEach((row, rowIndex) =>
    row.forEach(([id, label], columnIndex) =>
      addCell(
        boxes,
        texts,
        left + columnIndex * 265.5,
        598 - rowIndex * 16,
        265.5,
        16,
        `${revision.leaveType === id ? "[X]" : "[ ]"} ${label}`,
      ),
    ),
  );

  header("III. ALASAN CUTI", 566);
  addCell(boxes, texts, left, 522, width, 44);
  wrap(texts, revision.reason, left + 4, 553, width - 8, 4);

  header("IV. LAMANYA CUTI", 506);
  const duration = [
    [52, "Selama"],
    [44, String(revision.calculatedWorkingDays ?? "-")],
    [38, "Hari"],
    [90, "Mulai Tanggal"],
    [112, date(revision.startDate)],
    [30, "s/d"],
    [165, date(revision.endDate)],
  ] as const;
  let durationX = left;
  duration.forEach(([cellWidth, value]) => {
    addCell(
      boxes,
      texts,
      durationX,
      484,
      cellWidth,
      22,
      value,
      value === "Selama" || value === "Mulai Tanggal",
    );
    durationX += cellWidth;
  });

  header("V. CATATAN CUTI", 468);
  const half = width / 2;
  addCell(boxes, texts, left, 452, half, 16, "CUTI TAHUNAN", true);
  [
    [48, "Tahun"],
    [50, "Sisa"],
    [half - 98, "Keterangan"],
  ].reduce((x, [w, value]) => {
    addCell(boxes, texts, x, 436, w as number, 16, value as string, true);
    return x + (w as number);
  }, left);
  (["N", "N1", "N2"] as const).forEach((bucket, index) => {
    const y = 420 - index * 16;
    const balance = options.annualBalances?.find(
      (item) => item.bucket === bucket,
    );
    const label = bucket === "N1" ? "N-1" : bucket === "N2" ? "N-2" : "N";
    addCell(boxes, texts, left, y, 48, 16, label);
    addCell(
      boxes,
      texts,
      left + 48,
      y,
      50,
      16,
      String(balance?.remainingDays ?? "-"),
    );
    addCell(
      boxes,
      texts,
      left + 98,
      y,
      half - 98,
      16,
      balance?.allocatedDays === undefined
        ? ""
        : `Cuti ${label} (${balance.allocatedDays} hari)`,
    );
  });
  [
    "1. CUTI BESAR",
    "2. CUTI SAKIT",
    "3. CUTI MELAHIRKAN",
    "4. CUTI KARENA ALASAN PENTING",
    "5. CUTI DI LUAR TANGGUNGAN NEGARA",
  ].forEach((value, index) =>
    addCell(
      boxes,
      texts,
      left + half,
      436 - index * 16,
      half,
      16,
      value,
      false,
      6.5,
    ),
  );

  header("VI. ALAMAT SELAMA MENJALANKAN CUTI", 356);
  const addressWidth = 372;
  addCell(boxes, texts, left, 264, addressWidth, 92);
  addText(texts, "Alamat:", left + 4, 344, true);
  wrap(
    texts,
    revision.leaveAddress ?? "Belum tersedia",
    left + 4,
    331,
    addressWidth - 8,
    6,
  );
  addCell(
    boxes,
    texts,
    left + addressWidth,
    338,
    width - addressWidth,
    18,
    "TELP.",
    true,
  );
  addText(
    texts,
    revision.leavePhone ?? "Belum tersedia",
    left + addressWidth + 39,
    344,
  );
  addCell(boxes, texts, left + addressWidth, 264, width - addressWidth, 74);
  addText(texts, "Hormat saya,", left + addressWidth + 48, 324);
  addText(texts, request.employee.fullName, left + addressWidth + 8, 280, true);
  addText(texts, `NIP. ${request.employee.nip}`, left + addressWidth + 8, 269);

  const decision = (
    title: string,
    bottom: number,
    height: number,
    identity: string[],
  ) => {
    header(title, bottom + height - 16);
    const rowY = bottom + height - 34;
    ["DISETUJUI", "PERUBAHAN", "DITANGGUHKAN", "TIDAK DISETUJUI"].forEach(
      (label, index) =>
        addCell(
          boxes,
          texts,
          left + index * (width / 4),
          rowY,
          width / 4,
          18,
          label,
          true,
          6.2,
        ),
    );
    addCell(boxes, texts, left, bottom, width, height - 34);
    identity.forEach((value, index) =>
      addText(
        texts,
        value,
        left + 310,
        bottom + 7 + (identity.length - 1 - index) * 10,
        index === 0,
        6.5,
      ),
    );
  };
  const supervisor = request.employee.directSupervisor;
  decision(
    "VII. PERTIMBANGAN ATASAN LANGSUNG",
    158,
    90,
    supervisor
      ? [
          supervisor.positionTitle,
          supervisor.fullName,
          `NIP. ${supervisor.nip}`,
        ]
      : ["Atasan langsung belum ditetapkan", "Nama: -", "NIP. -"],
  );
  const official = options.authorizedOfficial;
  decision("VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI", 42, 108, [
    "Kepala Kantor Pencarian dan Pertolongan Kelas B Nias",
    official?.fullName ?? "Nama pejabat belum dikonfigurasi",
    official ? `NIP. ${official.nip}` : "NIP. -",
  ]);
  return pdf(texts, boxes);
}
