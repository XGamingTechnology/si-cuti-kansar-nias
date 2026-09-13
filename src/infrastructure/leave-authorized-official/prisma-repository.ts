import type { PrismaClient } from "@/generated/prisma/client";
import type {
  LeaveAuthorizedOfficialAssignment,
  LeaveAuthorizedOfficialRepository,
  LeaveAuthorizedOfficialWrite,
} from "@/application/leave-authorized-official/service";

const select = {
  id: true,
  fullName: true,
  nip: true,
  capacity: true,
  effectiveFrom: true,
  effectiveTo: true,
  sourceReference: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

function date(value: Date) {
  return value.toISOString().slice(0, 10);
}
function map(row: {
  id: string;
  fullName: string;
  nip: string;
  capacity: "DEFINITIVE" | "PLT" | "PLH";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LeaveAuthorizedOfficialAssignment {
  return {
    ...row,
    effectiveFrom: date(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? date(row.effectiveTo) : null,
  };
}
function data(input: LeaveAuthorizedOfficialWrite) {
  return {
    ...input,
    effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
    effectiveTo: input.effectiveTo
      ? new Date(`${input.effectiveTo}T00:00:00.000Z`)
      : null,
  };
}

export class PrismaLeaveAuthorizedOfficialRepository implements LeaveAuthorizedOfficialRepository {
  constructor(private readonly database: PrismaClient) {}
  async list() {
    return (
      await this.database.leaveAuthorizedOfficialAssignment.findMany({
        select,
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      })
    ).map(map);
  }
  async findById(id: string) {
    const row =
      await this.database.leaveAuthorizedOfficialAssignment.findUnique({
        where: { id },
        select,
      });
    return row ? map(row) : null;
  }
  async findOverlapping(from: string, to: string | null, excludeId?: string) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = to ? new Date(`${to}T00:00:00.000Z`) : null;
    return (
      await this.database.leaveAuthorizedOfficialAssignment.findMany({
        where: {
          ...(excludeId ? { id: { not: excludeId } } : {}),
          effectiveFrom: end ? { lte: end } : undefined,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
        select,
      })
    ).map(map);
  }
  async create(input: LeaveAuthorizedOfficialWrite) {
    return map(
      await this.database.leaveAuthorizedOfficialAssignment.create({
        data: data(input),
        select,
      }),
    );
  }
  async update(id: string, input: LeaveAuthorizedOfficialWrite) {
    return map(
      await this.database.leaveAuthorizedOfficialAssignment.update({
        where: { id },
        data: data(input),
        select,
      }),
    );
  }
  async findEffectiveOn(value: string) {
    const target = new Date(`${value}T00:00:00.000Z`);
    return (
      await this.database.leaveAuthorizedOfficialAssignment.findMany({
        where: {
          effectiveFrom: { lte: target },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }],
        },
        select,
        take: 2,
      })
    ).map(map);
  }
}
