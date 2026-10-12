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

export class PrismaLeaveAuthorizedOfficialRepository
  implements LeaveAuthorizedOfficialRepository
{
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

  update(id: string, input: LeaveAuthorizedOfficialInput) {
    return this.database.leaveAuthorizedOfficialAssignment
      .update({ where: { id }, data: this.data(input) })
      .then(record);
  }

  private data(input: LeaveAuthorizedOfficialInput) {
    return {
      ...input,
      effectiveFrom: dbDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? dbDate(input.effectiveTo) : null,
    };
  }
}
