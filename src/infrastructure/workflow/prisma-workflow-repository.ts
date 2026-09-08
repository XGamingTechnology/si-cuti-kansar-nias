import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  LeaveRequestRecord,
  LeaveRevision,
  PermissionRequestRecord,
  PermissionRevision,
  TransitionRecord,
  TransitionWrite,
  WorkflowRepository,
  WorkflowTransaction,
} from "@/application/workflow/ports";
import type {
  LeaveRevisionContent,
  PermissionRevisionContent,
  WorkflowStatus,
} from "@/application/workflow/types";
import { WorkflowError } from "@/application/workflow/types";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";

type Db = Prisma.TransactionClient | PrismaClient;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const businessDate = (value: Date) => value.toISOString().slice(0, 10);

type LeaveWithRevision = Prisma.LeaveRequestGetPayload<{
  include: { revisions: true };
}>;
type PermissionWithRevision = Prisma.PermissionRequestGetPayload<{
  include: { revisions: { include: { permissionType: true } } };
}>;

function leaveRevision(
  value: LeaveWithRevision["revisions"][number],
): LeaveRevision {
  return {
    id: value.id,
    requestId: value.leaveRequestId,
    revisionNumber: value.revisionNumber,
    leaveType: value.leaveType,
    startDate: businessDate(value.startDate),
    endDate: businessDate(value.endDate),
    reason: value.reason,
    calculatedWorkingDays: value.calculatedWorkingDays,
    submittedAt: value.submittedAt,
  };
}
function leaveRequest(value: LeaveWithRevision): LeaveRequestRecord {
  const current = value.revisions.find(
    (r) => r.revisionNumber === value.currentRevisionNumber,
  );
  if (!current)
    throw new WorkflowError("CONFLICT", "Revisi cuti aktif tidak ditemukan.");
  return {
    id: value.id,
    employeeId: value.employeeId,
    status: value.status,
    currentRevisionNumber: value.currentRevisionNumber,
    currentRevision: leaveRevision(current),
  };
}
function permissionRevision(
  value: PermissionWithRevision["revisions"][number],
): PermissionRevision {
  return {
    id: value.id,
    requestId: value.permissionRequestId,
    revisionNumber: value.revisionNumber,
    permissionTypeId: value.permissionTypeId,
    startDate: businessDate(value.startDate),
    endDate: businessDate(value.endDate),
    reason: value.reason,
    submittedAt: value.submittedAt,
    permissionTypeActive: value.permissionType.isActive,
  };
}
function permissionRequest(
  value: PermissionWithRevision,
): PermissionRequestRecord {
  const current = value.revisions.find(
    (r) => r.revisionNumber === value.currentRevisionNumber,
  );
  if (!current)
    throw new WorkflowError("CONFLICT", "Revisi izin aktif tidak ditemukan.");
  return {
    id: value.id,
    employeeId: value.employeeId,
    status: value.status,
    currentRevisionNumber: value.currentRevisionNumber,
    currentRevision: permissionRevision(current),
  };
}
function transition(value: {
  id: string;
  revisionId: string;
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  actorUserId: string;
  reason: string | null;
  evidenceReference: string | null;
  occurredAt: Date;
  idempotencyKey: string;
  leaveRequestId?: string;
  permissionRequestId?: string;
}): TransitionRecord {
  return {
    id: value.id,
    requestId: value.leaveRequestId ?? value.permissionRequestId!,
    revisionId: value.revisionId,
    fromStatus: value.fromStatus,
    toStatus: value.toStatus,
    actorUserId: value.actorUserId,
    reason: value.reason,
    evidenceReference: value.evidenceReference,
    occurredAt: value.occurredAt,
    idempotencyKey: value.idempotencyKey,
  };
}

const leaveInclude = { revisions: true } as const;
const permissionInclude = {
  revisions: { include: { permissionType: true } },
} as const;

class PrismaWorkflowTransaction implements WorkflowTransaction {
  readonly annualBalanceRepository;
  constructor(private readonly db: Prisma.TransactionClient) {
    this.annualBalanceRepository =
      PrismaAnnualBalanceRepository.inTransaction(db);
  }
  async lockLeaveRequest(id: string) {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "LeaveRequest" WHERE "id" = ${id}::uuid FOR UPDATE`,
    );
    if (!rows.length) return null;
    const value = await this.db.leaveRequest.findUnique({
      where: { id },
      include: leaveInclude,
    });
    return value ? leaveRequest(value) : null;
  }
  async lockPermissionRequest(id: string) {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "PermissionRequest" WHERE "id" = ${id}::uuid FOR UPDATE`,
    );
    if (!rows.length) return null;
    const value = await this.db.permissionRequest.findUnique({
      where: { id },
      include: permissionInclude,
    });
    return value ? permissionRequest(value) : null;
  }
  async findLeaveTransitionByKey(key: string) {
    const v = await this.db.leaveRequestTransition.findUnique({
      where: { idempotencyKey: key },
    });
    return v ? transition(v) : null;
  }
  async findPermissionTransitionByKey(key: string) {
    const v = await this.db.permissionRequestTransition.findUnique({
      where: { idempotencyKey: key },
    });
    return v ? transition(v) : null;
  }
  async setLeaveStatus(id: string, status: WorkflowStatus) {
    await this.db.leaveRequest.update({ where: { id }, data: { status } });
  }
  async setPermissionStatus(id: string, status: WorkflowStatus) {
    await this.db.permissionRequest.update({ where: { id }, data: { status } });
  }
  async submitLeaveRevision(id: string, at: Date, workingDays: number | null) {
    await this.db.leaveRequestRevision.update({
      where: { id },
      data: { submittedAt: at, calculatedWorkingDays: workingDays },
    });
  }
  async submitPermissionRevision(id: string, at: Date) {
    await this.db.permissionRequestRevision.update({
      where: { id },
      data: { submittedAt: at },
    });
  }
  async createLeaveCorrection(request: LeaveRequestRecord) {
    const revisionNumber = request.currentRevisionNumber + 1;
    const source = request.currentRevision;
    const made = await this.db.leaveRequestRevision.create({
      data: {
        leaveRequestId: request.id,
        revisionNumber,
        leaveType: source.leaveType,
        startDate: date(source.startDate),
        endDate: date(source.endDate),
        reason: source.reason,
      },
    });
    await this.db.leaveRequest.update({
      where: { id: request.id },
      data: { currentRevisionNumber: revisionNumber },
    });
    return leaveRevision(made);
  }
  async createPermissionCorrection(request: PermissionRequestRecord) {
    const revisionNumber = request.currentRevisionNumber + 1;
    const source = request.currentRevision;
    const made = await this.db.permissionRequestRevision.create({
      data: {
        permissionRequestId: request.id,
        revisionNumber,
        permissionTypeId: source.permissionTypeId,
        startDate: date(source.startDate),
        endDate: date(source.endDate),
        reason: source.reason,
      },
      include: { permissionType: true },
    });
    await this.db.permissionRequest.update({
      where: { id: request.id },
      data: { currentRevisionNumber: revisionNumber },
    });
    return permissionRevision(made);
  }
  async appendLeaveTransition(input: TransitionWrite) {
    const made = await this.db.leaveRequestTransition.create({
      data: {
        leaveRequestId: input.requestId,
        revisionId: input.revisionId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: input.actorUserId,
        reason: input.reason,
        evidenceReference: input.evidenceReference,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return transition(made);
  }
  async appendPermissionTransition(input: TransitionWrite) {
    const made = await this.db.permissionRequestTransition.create({
      data: {
        permissionRequestId: input.requestId,
        revisionId: input.revisionId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: input.actorUserId,
        reason: input.reason,
        evidenceReference: input.evidenceReference,
        occurredAt: input.occurredAt,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return transition(made);
  }
  permissionTypeIsActive(id: string) {
    return this.db.permissionType
      .count({ where: { id, isActive: true } })
      .then(Boolean);
  }
  async listCalendarOverrides(start: string, end: string) {
    const rows = await this.db.workingCalendarException.findMany({
      where: { date: { gte: date(start), lte: date(end) } },
      orderBy: { date: "asc" },
    });
    return rows.map((r) => ({ date: businessDate(r.date), type: r.type }));
  }
}

export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: PrismaClient) {}
  transaction<T>(work: (transaction: WorkflowTransaction) => Promise<T>) {
    return this.db.$transaction((tx) =>
      work(new PrismaWorkflowTransaction(tx)),
    );
  }
  async createLeaveDraft(employeeId: string, content: LeaveRevisionContent) {
    const value = await this.db.leaveRequest.create({
      data: {
        employeeId,
        revisions: {
          create: {
            revisionNumber: 1,
            leaveType: content.leaveType,
            startDate: date(content.startDate),
            endDate: date(content.endDate),
            reason: content.reason,
          },
        },
      },
      include: leaveInclude,
    });
    return leaveRequest(value);
  }
  async createPermissionDraft(
    employeeId: string,
    content: PermissionRevisionContent,
  ) {
    const value = await this.db.permissionRequest.create({
      data: {
        employeeId,
        revisions: {
          create: {
            revisionNumber: 1,
            permissionTypeId: content.permissionTypeId,
            startDate: date(content.startDate),
            endDate: date(content.endDate),
            reason: content.reason,
          },
        },
      },
      include: permissionInclude,
    });
    return permissionRequest(value);
  }
  async updateLeaveRevision(
    id: string,
    revisionId: string,
    content: LeaveRevisionContent,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = new PrismaWorkflowTransaction(tx);
      const request = await locked.lockLeaveRequest(id);
      if (!request)
        throw new WorkflowError("NOT_FOUND", "Pengajuan cuti tidak ditemukan.");
      if (
        request.currentRevision.id !== revisionId ||
        request.currentRevision.submittedAt ||
        !["DRAFT", "RETURNED_FOR_CORRECTION"].includes(request.status)
      )
        throw new WorkflowError(
          "ILLEGAL_TRANSITION",
          "Revisi yang sudah diajukan tidak dapat diubah.",
        );
      await tx.leaveRequestRevision.update({
        where: { id: revisionId },
        data: {
          leaveType: content.leaveType,
          startDate: date(content.startDate),
          endDate: date(content.endDate),
          reason: content.reason,
        },
      });
      return leaveRequest(
        await tx.leaveRequest.findUniqueOrThrow({
          where: { id },
          include: leaveInclude,
        }),
      );
    });
  }
  async updatePermissionRevision(
    id: string,
    revisionId: string,
    content: PermissionRevisionContent,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = new PrismaWorkflowTransaction(tx);
      const request = await locked.lockPermissionRequest(id);
      if (!request)
        throw new WorkflowError("NOT_FOUND", "Pengajuan izin tidak ditemukan.");
      if (
        request.currentRevision.id !== revisionId ||
        request.currentRevision.submittedAt ||
        !["DRAFT", "RETURNED_FOR_CORRECTION"].includes(request.status)
      )
        throw new WorkflowError(
          "ILLEGAL_TRANSITION",
          "Revisi yang sudah diajukan tidak dapat diubah.",
        );
      if (!(await locked.permissionTypeIsActive(content.permissionTypeId)))
        throw new WorkflowError("VALIDATION", "Jenis izin tidak aktif.");
      await tx.permissionRequestRevision.update({
        where: { id: revisionId },
        data: {
          permissionTypeId: content.permissionTypeId,
          startDate: date(content.startDate),
          endDate: date(content.endDate),
          reason: content.reason,
        },
      });
      return permissionRequest(
        await tx.permissionRequest.findUniqueOrThrow({
          where: { id },
          include: permissionInclude,
        }),
      );
    });
  }
  async getLeave(id: string) {
    const v = await this.db.leaveRequest.findUnique({
      where: { id },
      include: leaveInclude,
    });
    return v ? leaveRequest(v) : null;
  }
  async getPermission(id: string) {
    const v = await this.db.permissionRequest.findUnique({
      where: { id },
      include: permissionInclude,
    });
    return v ? permissionRequest(v) : null;
  }
  async listLeaveRevisions(id: string) {
    return (
      await this.db.leaveRequestRevision.findMany({
        where: { leaveRequestId: id },
        orderBy: { revisionNumber: "asc" },
      })
    ).map(leaveRevision);
  }
  async listPermissionRevisions(id: string) {
    return (
      await this.db.permissionRequestRevision.findMany({
        where: { permissionRequestId: id },
        include: { permissionType: true },
        orderBy: { revisionNumber: "asc" },
      })
    ).map(permissionRevision);
  }
  async listLeaveTransitions(id: string) {
    return (
      await this.db.leaveRequestTransition.findMany({
        where: { leaveRequestId: id },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      })
    ).map(transition);
  }
  async listPermissionTransitions(id: string) {
    return (
      await this.db.permissionRequestTransition.findMany({
        where: { permissionRequestId: id },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      })
    ).map(transition);
  }
  permissionTypeIsActive(id: string) {
    return this.db.permissionType
      .count({ where: { id, isActive: true } })
      .then(Boolean);
  }
}
