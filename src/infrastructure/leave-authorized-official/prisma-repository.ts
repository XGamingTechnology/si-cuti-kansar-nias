import { LeaveAuthorizedOfficialError } from "@/application/leave-authorized-official/service";
import { toBusinessDate } from "@/domain/business-date";
import type { OfficialIdentity } from "@/application/leave-authorized-official/correction";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  LeaveAuthorizedOfficialAssignment,
  LeaveAuthorizedOfficialInput,
  LeaveAuthorizedOfficialRepository,
} from "@/application/leave-authorized-official/service";

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function record(value: {
  id: string;
  fullName: string;
  nip: string;
  capacity: "DEFINITIVE" | "PLT" | "PLH";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceReference: string | null;
  notes: string | null;
}): LeaveAuthorizedOfficialAssignment {
  return {
    ...value,
    effectiveFrom: dateOnly(value.effectiveFrom),
    effectiveTo: value.effectiveTo ? dateOnly(value.effectiveTo) : null,
  };
}

function dbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export class PrismaLeaveAuthorizedOfficialRepository implements LeaveAuthorizedOfficialRepository {
  constructor(private readonly database: PrismaClient) {}

  async list() {
    return (
      await this.database.leaveAuthorizedOfficialAssignment.findMany({
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      })
    ).map(record);
  }

  async findById(id: string) {
    const value =
      await this.database.leaveAuthorizedOfficialAssignment.findUnique({
        where: { id },
      });
    return value ? record(value) : null;
  }

  async findEffectiveAt(timestamp: Date) {
    const date = toBusinessDate(timestamp);
    const rows = await this.database.leaveAuthorizedOfficialAssignment.findMany(
      {
        include: {
          corrections: {
            where: { correctedAt: { gt: timestamp } },
            orderBy: { revision: "asc" },
            take: 1,
          },
        },
        orderBy: { effectiveFrom: "desc" },
      },
    );
    // Restore the holder visible before the earliest period/identity correction
    // affecting this submission date. A successor created after that correction
    // must not displace the original holder when an old form is downloaded again.
    const historical = rows
      .filter((row) => row.corrections.length)
      .sort(
        (a, b) =>
          a.corrections[0].correctedAt.getTime() -
          b.corrections[0].correctedAt.getTime(),
      );
    for (const row of historical) {
      const old = row.corrections[0].before as OfficialIdentity;
      if (
        old.effectiveFrom <= date &&
        (!old.effectiveTo || old.effectiveTo >= date)
      ) {
        const { corrections: _history, ...assignment } = row;
        void _history;
        return { ...record(assignment), ...old };
      }
    }
    for (const row of rows) {
      const { corrections: _history, ...assignment } = row;
      void _history;
      const value = record(assignment);
      if (
        value.effectiveFrom <= date &&
        (!value.effectiveTo || value.effectiveTo >= date)
      )
        return value;
    }
    return null;
  }

  async findEffectiveOn(date: string) {
    const target = dbDate(date);
    const value =
      await this.database.leaveAuthorizedOfficialAssignment.findFirst({
        where: {
          effectiveFrom: { lte: target },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
        },
      });
    return value ? record(value) : null;
  }

  async hasOverlap(from: string, to: string | null, exceptId?: string) {
    return (
      (await this.database.leaveAuthorizedOfficialAssignment.count({
        where: {
          ...(exceptId ? { id: { not: exceptId } } : {}),
          effectiveFrom: to ? { lte: dbDate(to) } : undefined,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: dbDate(from) } }],
        },
      })) > 0
    );
  }

  create(input: LeaveAuthorizedOfficialInput) {
    return this.database.leaveAuthorizedOfficialAssignment
      .create({ data: this.data(input) })
      .then(record);
  }

  update(
    id: string,
    input: LeaveAuthorizedOfficialInput,
    expectedRevision?: number,
  ) {
    return this.database.leaveAuthorizedOfficialAssignment
      .update({
        where: {
          id,
          ...(expectedRevision === undefined
            ? {}
            : { revision: expectedRevision }),
        },
        data: { ...this.data(input), revision: { increment: 1 } },
      })
      .then(record)
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        )
          throw new LeaveAuthorizedOfficialError(
            "CONFLICT",
            "Data sudah berubah. Muat ulang penugasan sebelum mengedit.",
          );
        throw error;
      });
  }

  private data(input: LeaveAuthorizedOfficialInput) {
    return {
      ...input,
      effectiveFrom: dbDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? dbDate(input.effectiveTo) : null,
    };
  }
}
