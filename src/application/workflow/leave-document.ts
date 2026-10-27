import { StandardFontEmbedder } from "pdf-lib";
import type { LeaveRequestRecord, TransitionRecord } from "./ports";
import {
  authorizedOfficialTitle,
  type LeaveAuthorizedOfficialCapacity,
} from "@/application/leave-authorized-official/service";
import { toBusinessDate } from "@/domain/business-date";

/** Both variants are the same submitted, pre-signature form. */
export type LeaveDocumentVariant = "proof" | "approved";
export type AnnualLeaveFormBalance = Readonly<{
  bucket: "N" | "N1" | "N2";
  remainingDays: number;
  allocatedDays?: number;
}>;
export type LeaveFormOptions = Readonly<{
  annualBalances?: readonly AnnualLeaveFormBalance[];
  authorizedOfficial?: Readonly<{
    fullName: string;
    nip: string;
    capacity: LeaveAuthorizedOfficialCapacity;
  }> | null;
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
    value instanceof Date ? toBusinessDate(value) : value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`;
}

export function calculateIndonesianTenure(
  start: string | null,
  submittedAt: Date,
) {
  if (!start) return "Belum tersedia";
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(`${toBusinessDate(submittedAt)}T00:00:00.000Z`);
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
type Sheet = { texts: Text[]; boxes: Box[] };
const regular = StandardFontEmbedder.for(
  "Helvetica" as Parameters<typeof StandardFontEmbedder.for>[0],
);
const strong = StandardFontEmbedder.for(
  "Helvetica-Bold" as Parameters<typeof StandardFontEmbedder.for>[0],
);
function printable(value: string) {
  return value.replace(/[^ -~ -ÿ\n]/g, "?");
}
// The low-level PDF Tj operator has no kerning adjustments. Measure advances
// rather than pdf-lib's kerned width so pairs such as AV cannot spill a cell.
function textWidth(value: string, size: number, bold: boolean) {
  const f = bold ? strong : regular;
  return (
    ([...value].reduce(
      (sum, c) =>
        sum +
        (f.font.getWidthOfGlyph(
          f.encoding.encodeUnicodeCodePoint(c.codePointAt(0)!).name,
        ) ?? 250),
      0,
    ) *
      size) /
    1000
  );
}
function lines(value: string, width: number, size = 7, bold = false) {
  const result: string[] = [];
  for (const paragraph of printable(value).split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? line + " " + word : word;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        line = "";
      }
      for (const char of word) {
        if (line && textWidth(line + char, size, bold) > width) {
          result.push(line);
          line = "";
        }
        line += char;
      }
    }
    result.push(line);
  }
  return result;
}
function pdf(sheets: Sheet[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const kids: string[] = [];
  for (const { texts, boxes } of sheets) {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const commands = [
      "q",
      "0 G",
      "0.45 w",
      ...boxes.map((b) => `${b.x} ${b.y} ${b.w} ${b.h} re S`),
      "Q",
    ];
    for (const t of texts)
      commands.push(
        "BT",
        `/${t.bold ? "F2" : "F1"} ${t.size ?? 7} Tf`,
        `1 0 0 1 ${t.x} ${t.y} Tm`,
        `(${escape(t.text)}) Tj`,
        "ET",
      );
    const stream = commands.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${sheets.length} >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
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
  const official = options.authorizedOfficial;
  if (!revision.submittedAt)
    throw new Error(
      "Formulir hanya tersedia untuk revisi yang telah diajukan.",
    );
  // Same sections/columns as the existing official form. Row height follows
  // measured text; long sections continue as table rows on another A4 sheet.
  const sheets: Sheet[] = [{ texts: [], boxes: [] }];
  let sheet = sheets[0],
    top = 726;
  const left = 32,
    width = 531;
  function text(value: string, x: number, y: number, size = 7, bold = false) {
    sheet.texts.push({ text: value, x, y, size, bold });
  }
  function newPage() {
    sheet = { texts: [], boxes: [] };
    sheets.push(sheet);
    top = 810;
  }
  function room(height: number) {
    if (top - height < 24) newPage();
  }
  type Cell = { w: number; value: string; bold?: boolean; size?: number };
  function row(cells: Cell[], minHeight = 24) {
    const all = cells.map((c) => lines(c.value, c.w - 8, c.size ?? 7, c.bold));
    // Split exceptionally long rows without dropping any text or shrinking it.
    let offset = 0;
    const count = Math.max(...all.map((v) => v.length));
    do {
      const remaining = count - offset;
      const needed = Math.max(minHeight, remaining * 9 + 7);
      if (needed > top - 24 && top < 100) newPage();
      const take = Math.max(
        1,
        Math.min(remaining, Math.floor((top - 24 - 7) / 9)),
      );
      const height = Math.max(minHeight, take * 9 + 7);
      room(height);
      let x = left;
      cells.forEach((c, i) => {
        sheet.boxes.push({ x, y: top - height, w: c.w, h: height });
        all[i]
          .slice(offset, offset + take)
          .forEach((v, j) =>
            text(v, x + 4, top - 11 - j * 9, c.size ?? 7, c.bold),
          );
        x += c.w;
      });
      top -= height;
      offset += take;
      if (offset < count) newPage();
    } while (offset < count);
  }
  function section(label: string, minimumBody = 24) {
    room(16 + minimumBody);
    row([{ w: width, value: label, bold: true }], 16);
  }
  // Recipient and title retain their existing wording and order.
  let recipientY = 814;
  for (const value of [
    `${revision.formPlace ?? "Tempat belum tersedia"}, ${date(revision.submittedAt)}`,
    "Kepada",
    "Yth.",
    official
      ? authorizedOfficialTitle(official.capacity)
      : "Pejabat yang berwenang memberikan cuti",
    "Di",
    "Gunungsitoli",
  ]) {
    for (const line of lines(value, 203, 7)) {
      text(line, 360, recipientY);
      recipientY -= 10;
    }
  }
  const titleY = Math.min(738, recipientY - 12);
  text("FORMULIR PERMINTAAN DAN PEMBERIAN CUTI", 166, titleY, 10.5, true);
  top = Math.min(726, titleY - 12);
  section("I. DATA PEGAWAI");
  row([
    { w: 55, value: "Nama", bold: true },
    { w: 210, value: request.employee.fullName },
    { w: 65, value: "NIP", bold: true },
    { w: 201, value: request.employee.nip },
  ]);
  row([
    { w: 55, value: "Jabatan", bold: true },
    { w: 210, value: request.employee.positionTitle },
    { w: 65, value: "Masa Kerja", bold: true },
    {
      w: 201,
      value: calculateIndonesianTenure(
        request.employee.employmentStartDate ?? null,
        revision.submittedAt,
      ),
    },
  ]);
  row([
    { w: 55, value: "Unit Kerja", bold: true },
    { w: 476, value: request.employee.workUnit },
  ]);
  section("II. JENIS CUTI YANG DIAMBIL", 64);
  top -= 4;
  const types = [
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
  ];
  for (const pair of types)
    row(
      pair.map(([id, label]) => ({
        w: 265.5,
        value: `${revision.leaveType === id ? "[X]" : "[ ]"} ${label}`,
      })),
      20,
    );
  top -= 2;
  section("III. ALASAN CUTI");
  row([{ w: width, value: revision.reason }], 44);
  section("IV. LAMANYA CUTI");
  row(
    [
      { w: 52, value: "Selama", bold: true },
      { w: 44, value: String(revision.calculatedWorkingDays ?? "-") },
      { w: 38, value: "Hari" },
      { w: 90, value: "Mulai Tanggal", bold: true },
      { w: 112, value: date(revision.startDate) },
      { w: 30, value: "s/d" },
      { w: 165, value: date(revision.endDate) },
    ],
    22,
  );
  section("V. CATATAN CUTI", 96);
  const half = width / 2;
  row(
    [
      { w: half, value: "CUTI TAHUNAN", bold: true },
      { w: half, value: "" },
    ],
    16,
  );
  row(
    [
      { w: 48, value: "Tahun", bold: true },
      { w: 50, value: "Sisa", bold: true },
      { w: half - 98, value: "Keterangan", bold: true },
      { w: half, value: "1. CUTI BESAR" },
    ],
    16,
  );
  for (const [i, bucket] of (["N", "N1", "N2"] as const).entries()) {
    const b = options.annualBalances?.find((v) => v.bucket === bucket),
      label = bucket === "N1" ? "N-1" : bucket === "N2" ? "N-2" : "N";
    row(
      [
        { w: 48, value: label },
        { w: 50, value: String(b?.remainingDays ?? "-") },
        {
          w: half - 98,
          value:
            b?.allocatedDays === undefined
              ? ""
              : `Cuti ${label} (${b.allocatedDays} hari)`,
        },
        {
          w: half,
          value: [
            "2. CUTI SAKIT",
            "3. CUTI MELAHIRKAN",
            "4. CUTI KARENA ALASAN PENTING",
          ][i],
          size: 6.5,
        },
      ],
      16,
    );
  }
  sheet.boxes.push({ x: left + half, y: top - 16, w: half, h: 16 });
  text("5. CUTI DI LUAR TANGGUNGAN NEGARA", left + half + 4, top - 11, 6.5);
  top -= 16;
  section("VI. ALAMAT SELAMA MENJALANKAN CUTI", 92);
  // Keep the address column, separate telephone row and applicant signature
  // area. Only the heights grow; very long addresses continue without loss.
  const address = lines(revision.leaveAddress ?? "Belum tersedia", 364);
  const phone = lines(revision.leavePhone ?? "Belum tersedia", 112);
  const applicantName = lines(request.employee.fullName, 151, 7, true);
  const applicantNip = lines(`NIP. ${request.employee.nip}`, 151);
  const phoneHeight = Math.max(18, phone.length * 9 + 7);
  const identityHeight =
    phoneHeight + (applicantName.length + applicantNip.length) * 9 + 40;
  let addressOffset = 0,
    firstAddressPage = true;
  do {
    room(Math.max(92, firstAddressPage ? identityHeight : 92));
    const take = Math.max(
      1,
      Math.min(address.length - addressOffset, Math.floor((top - 24 - 24) / 9)),
    );
    const height = Math.max(
      92,
      take * 9 + 24,
      firstAddressPage ? identityHeight : 92,
    );
    room(height);
    const bottom = top - height,
      right = left + 372;
    sheet.boxes.push({ x: left, y: bottom, w: 372, h: height });
    text("Alamat:", left + 4, top - 11, 7, true);
    address
      .slice(addressOffset, addressOffset + take)
      .forEach((v, i) => text(v, left + 4, top - 25 - i * 9));
    if (firstAddressPage) {
      sheet.boxes.push(
        { x: right, y: top - phoneHeight, w: 159, h: phoneHeight },
        { x: right, y: bottom, w: 159, h: height - phoneHeight },
      );
      text("TELP.", right + 4, top - 11, 7, true);
      phone.forEach((v, i) => text(v, right + 39, top - 11 - i * 9));
      text("Hormat saya,", right + 48, top - phoneHeight - 14);
      const identity = [...applicantName, ...applicantNip];
      identity.forEach((v, i) =>
        text(
          v,
          right + 4,
          bottom + 7 + (identity.length - 1 - i) * 9,
          7,
          i < applicantName.length,
        ),
      );
    } else sheet.boxes.push({ x: right, y: bottom, w: 159, h: height });
    top = bottom;
    addressOffset += take;
    firstAddressPage = false;
    if (addressOffset < address.length) newPage();
  } while (addressOffset < address.length);
  const supervisor = revision.directSupervisorSnapshotCaptured
    ? revision.directSupervisorSnapshot
    : request.employee.directSupervisor;
  function decision(title: string, values: string[], minimum: number) {
    const identityLines = values.flatMap((v) => lines(v, 213, 6.5));
    const height = Math.max(minimum - 34, identityLines.length * 9 + 26);
    room(34 + height);
    section(title);
    row(
      ["DISETUJUI", "PERUBAHAN", "DITANGGUHKAN", "TIDAK DISETUJUI"].map(
        (value) => ({ w: width / 4, value, bold: true, size: 6.2 }),
      ),
      18,
    );
    sheet.boxes.push({ x: left, y: top - height, w: width, h: height });
    identityLines.forEach((v, i) =>
      text(
        v,
        left + 310,
        top - height + 7 + (identityLines.length - 1 - i) * 9,
        6.5,
        i === 0,
      ),
    );
    top -= height;
  }
  top -= 8;
  decision(
    "VII. PERTIMBANGAN ATASAN LANGSUNG",
    supervisor
      ? [
          supervisor.positionTitle,
          supervisor.fullName,
          `NIP. ${supervisor.nip}`,
        ]
      : ["Atasan langsung belum ditetapkan", "Nama: -", "NIP. -"],
    90,
  );
  top -= 8;
  decision(
    "VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI",
    [
      official
        ? authorizedOfficialTitle(official.capacity)
        : "Pejabat yang berwenang memberikan cuti",
      official?.fullName ?? "Nama pejabat belum dikonfigurasi",
      official ? `NIP. ${official.nip}` : "NIP. -",
    ],
    108,
  );
  return pdf(sheets);
}
