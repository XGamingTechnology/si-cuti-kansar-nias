import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { DashboardError } from "@/application/dashboard/contracts";
import {
  overlayDigest,
  type OverlayVersion,
  type OverlayPublication,
  type OverlayRepository,
  type OverlayEvent,
} from "@/application/dashboard/overlay";
function view(v: {
  id: string;
  year: number;
  version: number;
  sourceReference: string;
  sourcePublishedOn: Date;
  sourceUrl: string;
  events: unknown;
  checksum: string;
  actorUserId: string;
  publishedAt: Date;
}): OverlayVersion {
  return {
    id: v.id,
    year: v.year,
    version: v.version,
    sourceReference: v.sourceReference,
    sourcePublishedOn: v.sourcePublishedOn.toISOString().slice(0, 10),
    sourceUrl: v.sourceUrl,
    events: v.events as OverlayEvent[],
    checksum: v.checksum,
    actorUserId: v.actorUserId,
    publishedAt: v.publishedAt.toISOString(),
  };
}
export class PrismaOverlayRepository implements OverlayRepository {
  constructor(private readonly db: PrismaClient) {}
  async latest(year: number) {
    const row = await this.db.calendarOverlayVersion.findFirst({
      where: { year },
      orderBy: { version: "desc" },
    });
    return row ? view(row) : null;
  }
  async history(year: number, limit: number, before?: number) {
    return (
      await this.db.calendarOverlayVersion.findMany({
        where: { year, ...(before ? { version: { lt: before } } : {}) },
        orderBy: { version: "desc" },
        take: limit,
      })
    ).map(view);
  }
  async publish(
    actor: string,
    p: OverlayPublication,
    payloadHash: string,
    now: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${p.idempotencyKey}, 61))`;
      const retry = await tx.calendarOverlayVersion.findUnique({
        where: { idempotencyKey: p.idempotencyKey },
      });
      if (retry) {
        if (retry.payloadHash !== payloadHash)
          throw new DashboardError(
            409,
            "Kunci retry telah dipakai untuk publikasi lain.",
          );
        return view(retry);
      }
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${p.data.year}::bigint)`;
      const current = await tx.calendarOverlayVersion.findFirst({
        where: { year: p.data.year },
        orderBy: { version: "desc" },
      });
      if ((current?.version ?? 0) !== p.expectedVersion)
        throw new DashboardError(
          409,
          "Dataset berubah. Muat ulang dan buat pratinjau lagi.",
        );
      const checksum = overlayDigest(p.data);
      if (current?.checksum === checksum)
        throw new DashboardError(
          409,
          "Dataset sama dengan versi yang sudah diterbitkan.",
        );
      return view(
        await tx.calendarOverlayVersion.create({
          data: {
            ...p.data,
            sourcePublishedOn: new Date(p.data.sourcePublishedOn),
            events: p.data.events as Prisma.InputJsonValue,
            version: p.expectedVersion + 1,
            checksum,
            actorUserId: actor,
            publishedAt: now,
            idempotencyKey: p.idempotencyKey,
            payloadHash,
          },
        }),
      );
    });
  }
}
