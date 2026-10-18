import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import type { Principal } from "@/modules/auth/service";
import type { StoredDocument } from "@/application/ports/document-storage";
export const DEFINITION = "m7-operational-v1";
export const RENDERER = "m7-render-v1";
export const MAX_ROWS = 1000,
  MAX_DATASET = 5 * 1024 * 1024,
  MAX_ARTIFACT = 10 * 1024 * 1024;
export class ReportError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const date = z
  .string()
  .regex(/^(19\d{2}|[2-9]\d{3})-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
export const filterSchema = z
  .object({
    reportCode: z.enum(["LEAVE_REQUESTS", "PERMISSION_REQUESTS"]),
    from: date,
    to: date,
    status: z
      .enum([
        "SUBMITTED",
        "RETURNED_FOR_CORRECTION",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "ALL_NON_DRAFT",
      ])
      .default("APPROVED"),
    type: z.string().trim().min(1).max(50).optional(),
    employeeId: z.uuid().optional(),
    search: z.string().trim().max(100).default(""),
    workUnit: z.string().trim().min(1).max(200).optional(),
    activeState: z.enum(["all", "active", "inactive"]).default("all"),
  })
  .strict();
export type Filters = z.infer<typeof filterSchema>;
export const createSchema = filterSchema.extend({ idempotencyKey: z.uuid() });
export const exportSchema = z
  .object({ format: z.enum(["PDF", "XLSX"]), idempotencyKey: z.uuid() })
  .strict();
export type Format = "PDF" | "XLSX";
export function parseFilters(value: unknown) {
  const parsed = createSchema.safeParse(value);
  if (!parsed.success)
    throw new ReportError(422, "INVALID_FILTER", "Filter laporan tidak valid.");
  const { idempotencyKey, ...filters } = parsed.data;
  if (
    filters.from > filters.to ||
    (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1 > 366
  )
    throw new ReportError(
      422,
      "INVALID_RANGE",
      "Rentang laporan harus berurutan dan maksimal 366 hari.",
    );
  if (
    filters.type &&
    !(filters.reportCode === "LEAVE_REQUESTS"
      ? [
          "ANNUAL",
          "SICK",
          "IMPORTANT_REASON",
          "LARGE",
          "MATERNITY",
          "CLTN",
        ].includes(filters.type)
      : z.uuid().safeParse(filters.type).success)
  )
    throw new ReportError(422, "INVALID_TYPE", "Jenis tidak sesuai laporan.");
  return { filters, idempotencyKey };
}
export const rowSchema = z
  .object({
    requestId: z.uuid(),
    revisionId: z.uuid(),
    revisionNumber: z.number().int().positive(),
    employeeId: z.uuid(),
    nip: z.string().max(32),
    name: z.string().max(200),
    workUnit: z.string().max(200),
    active: z.boolean(),
    typeCode: z.string().max(100),
    typeLabel: z.string().max(200),
    startDate: date,
    endDate: date,
    status: z.string().max(40),
    submittedAt: z.string().datetime().nullable(),
    workingDays: z.number().int().nonnegative().nullable(),
    hasBalanceReturn: z.boolean(),
  })
  .strict();
export type ReportRow = z.infer<typeof rowSchema>;
export const datasetSchema = z
  .object({
    runId: z.uuid(),
    definitionVersion: z.literal(DEFINITION),
    rendererVersion: z.literal(RENDERER),
    capturedAt: z.string().datetime(),
    filters: filterSchema,
    rows: z.array(rowSchema).max(MAX_ROWS),
    filterLabels: z
      .object({
        employee: z.string().max(400).optional(),
        type: z.string().max(400).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Dataset = z.infer<typeof datasetSchema>;
export const checksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const fingerprint = (secret: string, value: unknown) =>
  createHmac("sha256", secret).update(JSON.stringify(value)).digest("hex");
export function redact(secret: string, f?: Filters) {
  if (!f) return {};
  const { search, workUnit, ...rest } = f;
  return {
    ...rest,
    searchApplied: Boolean(search),
    workUnitApplied: Boolean(workUnit),
    ...(workUnit ? { workUnitDigest: fingerprint(secret, workUnit) } : {}),
    ...(search ? { searchDigest: fingerprint(secret, search) } : {}),
  };
}
export function summary(rows: readonly ReportRow[]) {
  const groups = new Map<
    string,
    { typeLabel: string; status: string; count: number }
  >();
  for (const r of rows) {
    const key = JSON.stringify([r.typeCode, r.status]);
    const g = groups.get(key) ?? {
      typeLabel: r.typeLabel,
      status: r.status,
      count: 0,
    };
    g.count++;
    groups.set(key, g);
  }
  return {
    requests: rows.length,
    employees: new Set(rows.map((r) => r.employeeId)).size,
    withBalanceReturn: rows.filter((r) => r.hasBalanceReturn).length,
    groups: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v),
  };
}
export type Run = {
  id: string;
  actorUserId: string;
  idempotencyKey: string;
  payloadHash: string;
  reportCode: string;
  definitionVersion: string;
  rendererVersion: string;
  filters: object;
  capturedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  rowCount: number;
  datasetKey: string;
  datasetChecksum: string;
  datasetSize: number;
};
export type Artifact = {
  id: string;
  runId: string;
  actorUserId: string;
  idempotencyKey: string;
  format: string;
  rendererVersion: string;
  storageKey: string;
  checksum: string;
  size: number;
  createdAt: Date;
};
export type Audit = {
  actorUserId: string | null;
  actorRole: string;
  occurredAt: Date;
  correlationId: string;
  runId: string | null;
  reportCode: string | null;
  definitionVersion: string;
  event: string;
  resultCode: string;
  format: string | null;
  rowCount: number | null;
  filters: object;
  datasetChecksum: string | null;
  artifactChecksum: string | null;
};
export interface ReportSession {
  activeAdmin(id: string): Promise<boolean>;
  retry(actor: string, key: string): Promise<Run | null>;
  run(id: string): Promise<Run | null>;
  insertRun(run: Run): Promise<void>;
  artifact(id: string): Promise<Artifact | null>;
  format(runId: string, format: Format): Promise<Artifact | null>;
  exportRetry(
    actor: string,
    key: string,
  ): Promise<{ runId: string; format: string; artifactId: string } | null>;
  exportRequest(
    actor: string,
    key: string,
    runId: string,
    format: Format,
    artifactId: string,
  ): Promise<void>;
  insertArtifact(artifact: Artifact): Promise<void>;
  audit(event: Audit): Promise<void>;
}
export interface ReportRepository {
  withActor<T>(
    actor: string,
    work: (session: ReportSession) => Promise<T>,
  ): Promise<T>;
  audit(event: Audit): Promise<void>;
}
export interface ReportReader {
  read(filters: Filters): Promise<{
    capturedAt: Date;
    rows: ReportRow[];
    filterLabels?: { employee?: string; type?: string };
  }>;
}
export interface ReportFiles {
  put(bytes: Uint8Array): Promise<StoredDocument>;
  read(key: string, max: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export interface ReportRenderers {
  render(format: Format, dataset: Dataset): Promise<Uint8Array>;
}
export type ReportActor = Principal;
