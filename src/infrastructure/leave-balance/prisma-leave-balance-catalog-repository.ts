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

  createJointLeaveEvent(input: {
    name: string;
    startDate: Date;
    endDate: Date;
    claimDays: number;
    isActive?: boolean;
    sourceReference?: string | null;
    notes?: string | null;
  }) {
    return this.database.jointLeaveEvent.create({ data: input });
  }
}
