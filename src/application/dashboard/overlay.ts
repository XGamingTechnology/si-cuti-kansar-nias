import { createHash } from "node:crypto";
import { z } from "zod";
import type { Principal } from "@/modules/auth/service";
import { requireAdmin } from "@/application/authorization/policy";
import { dateSchema, DashboardError, requireDashboardUser } from "./contracts";
export const overlayInput = z
  .object({
    year: z.number().int().min(1900).max(9999),
    sourceReference: z.string().trim().min(1).max(500),
    sourcePublishedOn: dateSchema,
    sourceUrl: z
      .string()
      .max(1000)
      .default("")
      .refine((v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            u.hostname.endsWith(".go.id") &&
            !u.username &&
            !u.password &&
            !u.port
          );
        } catch {
          return false;
        }
      }),
    events: z
      .array(
        z
          .object({
            date: dateSchema,
            name: z.string().trim().min(1).max(200),
            category: z.enum(["PUBLIC_HOLIDAY", "JOINT_LEAVE"]),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type OverlayInput = z.infer<typeof overlayInput>;
export type OverlayEvent = OverlayInput["events"][number];
export type OverlayVersion = OverlayInput & {
  id: string;
  version: number;
  publishedAt: string;
  actorUserId: string;
  checksum: string;
};
export type OverlayPublication = {
  data: OverlayInput;
  expectedVersion: number;
  fingerprint: string;
  idempotencyKey: string;
  confirmed: true;
};
export interface OverlayRepository {
  latest(year: number): Promise<OverlayVersion | null>;
  history(
    year: number,
    limit: number,
    before?: number,
  ): Promise<OverlayVersion[]>;
  publish(
    actor: string,
    input: OverlayPublication,
    payloadHash: string,
    now: Date,
  ): Promise<OverlayVersion>;
}
export function normalizeOverlay(value: unknown): OverlayInput {
  const parsed = overlayInput.safeParse(value);
  if (!parsed.success)
    throw new DashboardError(
      422,
      "Dataset tidak valid. Isi tahun, referensi resmi, tanggal dokumen dan 1–500 tanggal/nama/kategori libur yang valid. URL opsional harus HTTPS pemerintah .go.id.",
    );
  const data = parsed.data;
  const seen = new Set<string>();
  for (const event of data.events) {
    const key = `${event.date}|${event.category}`;
    if (!event.date.startsWith(`${data.year}-`) || seen.has(key))
      throw new DashboardError(
        422,
        "Tahun event harus sesuai dataset; tanggal/kategori tidak boleh duplikat.",
      );
    seen.add(key);
  }
  return {
    ...data,
    events: [...data.events].sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.category.localeCompare(b.category),
    ),
  };
}
export const overlayDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function overlayYear(params: URLSearchParams) {
  const parsed = z
    .object({ year: z.coerce.number().int().min(1900).max(9999) })
    .strict()
    .safeParse(Object.fromEntries(params));
  if (!parsed.success)
    throw new DashboardError(422, "Tahun overlay tidak valid.");
  return parsed.data.year;
}
export class OverlayService {
  constructor(
    private readonly repository: OverlayRepository,
    private readonly clock = () => new Date(),
  ) {}
  async read(actor: Principal, year: number) {
    requireDashboardUser(actor);
    const version = await this.repository.latest(year);
    return {
      year,
      status: version ? "AVAILABLE" : "UNAVAILABLE",
      connector: "MANUAL_OFFICIAL_DOCUMENT",
      automaticallySynced: false,
      dataset: version
        ? {
            version: version.version,
            events: version.events,
            sourceReference: version.sourceReference,
            sourcePublishedOn: version.sourcePublishedOn,
            sourceUrl: version.sourceUrl,
            publishedAt: version.publishedAt,
            checksum: version.checksum,
          }
        : null,
    };
  }
  async history(actor: Principal, params: URLSearchParams) {
    requireAdmin(actor);
    const parsed = z
      .object({
        year: z.coerce.number().int().min(1900).max(9999),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        before: z.coerce.number().int().positive().optional(),
      })
      .strict()
      .safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new DashboardError(422, "Filter riwayat tidak valid.");
    const p = parsed.data;
    const rows = await this.repository.history(p.year, p.limit + 1, p.before);
    return {
      versions: rows.slice(0, p.limit),
      nextBefore: rows.length > p.limit ? rows[p.limit - 1].version : null,
    };
  }
  async preview(actor: Principal, value: unknown) {
    requireAdmin(actor);
    const data = normalizeOverlay(value);
    const latest = await this.repository.latest(data.year);
    const expectedVersion = latest?.version ?? 0;
    const fingerprint = overlayDigest({
      actor: actor.userId,
      data,
      expectedVersion,
    });
    const key = (e: OverlayEvent) => `${e.date}|${e.category}`;
    const old = new Map(latest?.events.map((e) => [key(e), e]) ?? []);
    const current = new Map(data.events.map((e) => [key(e), e]));
    return {
      data,
      expectedVersion,
      fingerprint,
      diff: {
        added: data.events.filter((e) => !old.has(key(e))),
        removed: (latest?.events ?? []).filter((e) => !current.has(key(e))),
        changed: data.events.filter(
          (e) => old.has(key(e)) && old.get(key(e))!.name !== e.name,
        ),
      },
    };
  }
  publish(actor: Principal, value: unknown) {
    requireAdmin(actor);
    const parsed = z
      .object({
        data: z.unknown(),
        expectedVersion: z.number().int().nonnegative(),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        idempotencyKey: z.uuid(),
        confirmed: z.literal(true),
      })
      .strict()
      .safeParse(value);
    if (!parsed.success)
      throw new DashboardError(
        422,
        "Publikasi memerlukan pratinjau, versi, kunci retry dan konfirmasi eksplisit.",
      );
    const p = parsed.data;
    const input = { ...p, data: normalizeOverlay(p.data) };
    if (
      overlayDigest({
        actor: actor.userId,
        data: input.data,
        expectedVersion: input.expectedVersion,
      }) !== input.fingerprint
    )
      throw new DashboardError(409, "Pratinjau berubah. Buat pratinjau ulang.");
    return this.repository.publish(
      actor.userId,
      input,
      overlayDigest({ actor: actor.userId, ...input }),
      this.clock(),
    );
  }
}
