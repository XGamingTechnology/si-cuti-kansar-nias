import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { toBusinessDate } from "@/domain/business-date";
import type {
  Policy,
  PolicyInput,
  SubmitInput,
  ReviewInput,
  EvidenceInput,
} from "./ports";

export class JointLeaveError extends Error {
  constructor(
    readonly code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "UNSUPPORTED",
    message: string,
  ) {
    super(message);
  }
}
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const checksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const currentYear = (now: Date) =>
  Number(toBusinessDate(now).slice(0, 4));
export function uuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new JointLeaveError("VALIDATION", "ID perintah/data tidak valid.");
  return value.toLowerCase();
}
function text(value: string, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new JointLeaveError(
      "VALIDATION",
      `${label} wajib diisi, maksimal ${max} karakter.`,
    );
  return value.trim();
}
export function year(value: number) {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 9998)
    throw new JointLeaveError("VALIDATION", "Tahun tidak valid.");
  return value;
}
export function validatePolicy(input: PolicyInput): PolicyInput {
  const creditYear = year(input.creditYear);
  if (
    !Number.isSafeInteger(input.quotaDays) ||
    input.quotaDays < 1 ||
    input.quotaDays > 366
  )
    throw new JointLeaveError(
      "VALIDATION",
      "Batas klaim harus bilangan bulat 1–366 sesuai dasar resmi.",
    );
  if (
    !Array.isArray(input.events) ||
    !input.events.length ||
    input.events.length > 366
  )
    throw new JointLeaveError(
      "VALIDATION",
      "Isi 1–366 tanggal yang ditetapkan Admin.",
    );
  const dates = new Set<string>();
  const events = input.events
    .map((e) => {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
        !Number.isFinite(new Date(e.date + "T00:00:00Z").getTime()) ||
        new Date(e.date + "T00:00:00Z").toISOString().slice(0, 10) !== e.date
      )
        throw new JointLeaveError(
          "VALIDATION",
          "Tanggal cuti bersama tidak valid.",
        );
      if (dates.has(e.date))
        throw new JointLeaveError(
          "VALIDATION",
          "Tanggal cuti bersama duplikat.",
        );
      dates.add(e.date);
      const eventYear = Number(e.date.slice(0, 4)),
        month = Number(e.date.slice(5, 7));
      if (
        e.kind === "REGULAR"
          ? eventYear !== creditYear
          : e.kind !== "YEAR_END" ||
            !(
              (eventYear === creditYear - 1 && month === 12) ||
              (eventYear === creditYear && month === 1)
            )
      )
        throw new JointLeaveError(
          "VALIDATION",
          "Tahun saldo harus cocok dengan tanggal biasa atau kelompok Natal/Tahun Baru Desember–Januari.",
        );
      return {
        date: e.date,
        name: text(e.name, "Nama tanggal", 200),
        kind: e.kind,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    name: text(input.name, "Nama pengaturan", 200),
    creditYear,
    quotaDays: input.quotaDays,
    sourceReference: text(
      input.sourceReference,
      "Referensi keputusan resmi",
      500,
    ),
    events,
  };
}
export function validateSubmit(input: SubmitInput): SubmitInput {
  if (
    !Array.isArray(input.eventIds) ||
    !input.eventIds.length ||
    input.eventIds.length > 366
  )
    throw new JointLeaveError("VALIDATION", "Pilih tanggal cuti bersama.");
  const eventIds = input.eventIds.map(uuid).sort();
  if (new Set(eventIds).size !== eventIds.length)
    throw new JointLeaveError("VALIDATION", "Pilihan tanggal duplikat.");
  if (
    !["SPECIAL_STANDBY", "OPERATIONS", "REGULAR_STANDBY"].includes(
      input.assignmentType,
    )
  )
    throw new JointLeaveError("VALIDATION", "Jenis penugasan tidak valid.");
  return {
    policyId: uuid(input.policyId),
    eventIds,
    assignmentType: input.assignmentType,
    title: text(input.title, "Judul penugasan", 300),
    sprinNumber: input.sprinNumber?.trim()
      ? text(input.sprinNumber, "Nomor Sprin", 200)
      : null,
    idempotencyKey: uuid(input.idempotencyKey),
  };
}
export function validateReview(input: ReviewInput): ReviewInput {
  if (
    !Array.isArray(input.approvedEventIds) ||
    input.approvedEventIds.length > 366 ||
    typeof input.evidenceVerified !== "boolean"
  )
    throw new JointLeaveError("VALIDATION", "Data pemeriksaan tidak valid.");
  const approvedEventIds = input.approvedEventIds.map(uuid).sort();
  if (new Set(approvedEventIds).size !== approvedEventIds.length)
    throw new JointLeaveError("VALIDATION", "Pilihan persetujuan duplikat.");
  if (approvedEventIds.length && !input.evidenceVerified)
    throw new JointLeaveError(
      "VALIDATION",
      "Konfirmasi kelengkapan dan kebenaran bukti sebelum menyetujui.",
    );
  return {
    approvedEventIds,
    reason: text(input.reason, "Alasan/catatan pemeriksaan", 3000),
    evidenceVerified: input.evidenceVerified,
    idempotencyKey: uuid(input.idempotencyKey),
    fingerprint: input.fingerprint ?? "",
  };
}
export function eligible(policy: Policy, now: Date) {
  if (!policy.isActive || policy.creditYear !== currentYear(now))
    throw new JointLeaveError(
      "UNSUPPORTED",
      "Klaim hanya dapat diajukan/disetujui pada tahun saldo yang berlaku.",
    );
}
export async function validateEvidence(input: EvidenceInput) {
  const b = Buffer.from(input.bytes);
  if (!b.length || b.length > 10 * 1024 * 1024)
    throw new JointLeaveError(
      "VALIDATION",
      "Bukti wajib diunggah, maksimal 10 MB.",
    );
  try {
    if (
      input.mime === "application/pdf" &&
      b.subarray(0, 5).toString() === "%PDF-"
    ) {
      const pdf = await PDFDocument.load(b);
      if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 100)
        throw Error();
      return;
    }
    // Raster files are fully decoded by the PDF image parser, not trusted from filename/MIME alone.
    if (input.mime === "image/png") {
      if (
        b.length < 33 ||
        b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        b.subarray(12, 16).toString() !== "IHDR"
      )
        throw Error();
      if (b.readUInt32BE(16) * b.readUInt32BE(20) > 40000000) throw Error();
    }
    const pdf = await PDFDocument.create();
    const image =
      input.mime === "image/png"
        ? await pdf.embedPng(b)
        : input.mime === "image/jpeg"
          ? await pdf.embedJpg(b)
          : null;
    if (
      !image ||
      image.width < 1 ||
      image.height < 1 ||
      image.width * image.height > 40000000
    )
      throw Error();
  } catch {
    throw new JointLeaveError(
      "VALIDATION",
      "Bukti harus PDF tidak terenkripsi, JPG atau PNG yang valid.",
    );
  }
}
