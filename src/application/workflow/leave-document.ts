import type { LeaveRequestRecord, TransitionRecord } from "./ports";

/** `approved` remains accepted for route compatibility; both variants intentionally
 * render the same submitted, pre-signature form semantics. */
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

const leaveTypes = [
  ["ANNUAL", "1. Cuti Tahunan"],
  ["LARGE", "2. Cuti Besar"],
  ["SICK", "3. Cuti Sakit"],
  ["MATERNITY", "4. Cuti Melahirkan"],
  ["IMPORTANT_REASON", "5. Cuti Karena Alasan Penting"],
  ["CLTN", "6. Cuti di Luar Tanggungan Negara"],
] as const;
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
    "0.5 w",
    ...boxes.map((b) => `${b.x} ${b.y} ${b.w} ${b.h} re S`),
    "Q",
  ];
  for (const t of texts)
    commands.push(
      "BT",
      `/${t.bold ? "F2" : "F1"} ${t.size ?? 7.5} Tf`,
      `1 0 0 1 ${t.x} ${t.y} Tm`,
      `(${escape(t.text)}) Tj`,
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
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++)
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}
function cell(
  texts: Text[],
  text: string,
  x: number,
  y: number,
  bold = false,
  size = 7.5,
) {
  texts.push({ text, x: x + 4, y: y + 8, bold, size });
}
function wrapped(
  texts: Text[],
  value: string,
  x: number,
  y: number,
  max = 85,
  lines = 3,
) {
  const words = value.split(/\s+/);
  let line = "",
    row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      texts.push({ text: line, x, y: y - row * 10 });
      row++;
      line = word;
    } else line = next;
    if (row >= lines) break;
  }
  if (line && row < lines) texts.push({ text: line, x, y: y - row * 10 });
}
export function generateLeaveDocument(
  request: LeaveRequestRecord,
  _history: readonly TransitionRecord[],
  _variant: LeaveDocumentVariant = "proof",
  _generatedAt = new Date(),
  options: LeaveFormOptions = {},
) {
  // Kept in the signature for temporary compatibility with existing callers.
  void _variant;
  void _generatedAt;
  const r = request.currentRevision;
  if (!r.submittedAt)
    throw new Error(
      "Formulir hanya tersedia untuk revisi yang telah diajukan.",
    );
  const t: Text[] = [];
  const b: Box[] = [];
  const L = 32,
    W = 531;
  t.push(
    {
      text: `${r.formPlace ?? "Tempat belum tersedia"}, ${date(r.submittedAt)}`,
      x: 360,
      y: 812,
      size: 8,
    },
    { text: "Kepada", x: 360, y: 798 },
    { text: "Yth.", x: 360, y: 787 },
    {
      text: "Kepala Kantor Pencarian dan Pertolongan Kelas B Nias",
      x: 380,
      y: 776,
      size: 7,
    },
    { text: "Di", x: 360, y: 765 },
    { text: "Gunungsitoli", x: 380, y: 754, bold: true },
    {
      text: "FORMULIR PERMINTAAN DAN PEMBERIAN CUTI",
      x: 160,
      y: 731,
      size: 11,
      bold: true,
    },
  );
  const section = (name: string, y: number, h: number) => {
    b.push({ x: L, y, w: W, h });
    t.push({ text: name, x: L + 4, y: y + h - 11, bold: true });
  };
  section("I. DATA PEGAWAI", 654, 62);
  cell(t, `Nama: ${request.employee.fullName}`, L, 681);
  cell(t, `NIP: ${request.employee.nip}`, 300, 681);
  cell(t, `Jabatan: ${request.employee.positionTitle}`, L, 665);
  cell(
    t,
    `Masa Kerja: ${calculateIndonesianTenure(request.employee.employmentStartDate ?? null, r.submittedAt)}`,
    300,
    665,
  );
  cell(t, `Unit Kerja: ${request.employee.workUnit}`, L, 650);
  section("II. JENIS CUTI YANG DIAMBIL", 584, 58);
  leaveTypes.forEach(([id, label], i) =>
    cell(
      t,
      `${r.leaveType === id ? "[X]" : "[ ]"} ${label}`,
      L + (i % 2) * 265,
      616 - Math.floor(i / 2) * 14,
    ),
  );
  section("III. ALASAN CUTI", 526, 46);
  wrapped(t, r.reason, L + 5, 548, 100, 3);
  section("IV. LAMANYA CUTI", 488, 26);
  cell(
    t,
    `Selama | ${r.calculatedWorkingDays ?? "-"} | Hari | Mulai Tanggal | ${date(r.startDate)} | s/d | ${date(r.endDate)}`,
    L,
    490,
  );
  section("V. CATATAN CUTI", 397, 79);
  b.push(
    { x: L, y: 397, w: 266, h: 65 },
    { x: L + 266, y: 397, w: 265, h: 65 },
  );
  cell(t, "CUTI TAHUNAN", L, 445, true);
  cell(t, "Tahun     Sisa     Keterangan", L, 432, true);
  (["N", "N1", "N2"] as const).forEach((bucket, i) => {
    const found = options.annualBalances?.find((v) => v.bucket === bucket);
    const label = bucket === "N1" ? "N-1" : bucket === "N2" ? "N-2" : "N";
    cell(
      t,
      `${label}          ${found?.remainingDays ?? "-"}       ${found?.allocatedDays ? `Cuti ${label} (${found.allocatedDays} hari)` : ""}`,
      L,
      418 - i * 12,
    );
  });
  [
    "1. CUTI BESAR",
    "2. CUTI SAKIT",
    "3. CUTI MELAHIRKAN",
    "4. CUTI KARENA ALASAN PENTING",
    "5. CUTI DI LUAR TANGGUNGAN NEGARA",
  ].forEach((v, i) => cell(t, v, L + 270, 445 - i * 12));
  section("VI. ALAMAT SELAMA MENJALANKAN CUTI", 300, 85);
  b.push(
    { x: L, y: 300, w: 315, h: 71 },
    { x: L + 315, y: 300, w: 216, h: 71 },
  );
  cell(t, "Alamat:", L, 351, true);
  wrapped(t, r.leaveAddress ?? "Belum tersedia", L + 5, 339, 48, 3);
  cell(t, `TELP.: ${r.leavePhone ?? "Belum tersedia"}`, L + 315, 351, true);
  cell(t, "Hormat saya,", L + 380, 335);
  cell(t, request.employee.fullName, L + 335, 307, true);
  cell(t, `NIP. ${request.employee.nip}`, L + 335, 297);
  const decisions = (title: string, y: number, identity: string[]) => {
    section(title, y, 84);
    const labels = [
      "DISETUJUI",
      "PERUBAHAN",
      "DITANGGUHKAN",
      "TIDAK DISETUJUI",
    ];
    labels.forEach((v, i) => {
      b.push({ x: L + i * 132.75, y: y + 57, w: 132.75, h: 14 });
      cell(t, v, L + i * 132.75, y + 59, true, 6.5);
    });
    identity.forEach((v, i) => cell(t, v, L + 315, y + 8 + i * 11, i === 0));
  };
  const s = request.employee.directSupervisor;
  decisions(
    "VII. PERTIMBANGAN ATASAN LANGSUNG",
    204,
    s
      ? [` ${s.positionTitle}`, s.fullName, `NIP. ${s.nip}`]
      : ["Atasan langsung belum ditetapkan"],
  );
  const official = options.authorizedOfficial;
  decisions("VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI", 108, [
    "Kepala Kantor Pencarian dan Pertolongan Kelas B Nias",
    official?.fullName ?? "Nama pejabat belum dikonfigurasi",
    official ? `NIP. ${official.nip}` : "NIP. -",
  ]);
  return pdf(t, b);
}
