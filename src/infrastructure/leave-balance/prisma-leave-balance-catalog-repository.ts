import type { PrismaClient } from "@/generated/prisma/client";

export class PrismaLeaveBalanceCatalogRepository {
  constructor(private readonly database: PrismaClient) {}

  createRolloverCommit(input: {
    employeeId: string;
    targetYear: number;
    committedAt: Date;
    idempotencyKey: string;
  }) {
    return this.database.annualRolloverCommit.create({ data: input });
  }

  createN2QualifyingPeriod(input: {
    employeeId: string;
    firstZeroUsageYear: number;
    secondZeroUsageYear: number;
    creditedYear: number;
    grantedDays: number;
    consumedAt: Date;
  }) {
    return this.database.n2QualifyingPeriod.create({ data: input });
  }

  createJointLeavePolicy(input: {
    name: string;
    applicableYear: number;
    quotaDays: number;
    claimOpensAt: Date;
    claimDeadlineAt: Date;
    creditYear: number;
    eventDates: ReadonlyArray<{ eventDate: Date; name: string }>;
    isActive?: boolean;
    sourceReference?: string | null;
    notes?: string | null;
  }) {
    const { eventDates, ...policy } = input;
    return this.database.jointLeavePolicy.create({
      data: { ...policy, eventDates: { create: [...eventDates] } },
      include: { eventDates: true },
    });
  }
}
