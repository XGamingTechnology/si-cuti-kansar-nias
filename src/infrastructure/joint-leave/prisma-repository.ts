import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Principal } from "@/modules/auth/service";
import type {
  Claim,
  ClaimCreate,
  ClaimQuery,
  JointLeaveRepository,
  JointLeaveTransaction,
  Policy,
  PolicyInput,
  ReviewInput,
} from "@/application/joint-leave/ports";
import { JointLeaveError } from "@/application/joint-leave/rules";
import type { AnnualBalanceAccountState } from "@/application/leave-balance/ports";

const include = {
  dates: { orderBy: { eventDate: "asc" as const } },
};
type ClaimRow = Prisma.JointLeaveClaimGetPayload<{ include: typeof include }>;
type PolicyRow = Prisma.JointLeavePolicyGetPayload<{
  include: { eventDates: true };
}>;
const policy = (p: PolicyRow): Policy => ({
  id: p.id,
  name: p.name,
  creditYear: p.creditYear,
  quotaDays: p.quotaDays,
  sourceReference: p.sourceReference,
  isActive: p.isActive,
  eventDates: p.eventDates
    .map((e) => ({
      id: e.id,
      date: e.eventDate.toISOString().slice(0, 10),
      name: e.name,
      kind: e.kind,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)),
});
const claim = (c: ClaimRow): Claim => ({
  ...c,
  employeeName: c.employeeNameSnapshot,
  employeeNip: c.employeeNipSnapshot,
  status: c.status as Claim["status"],
  policySnapshot: c.policySnapshot as unknown as Policy,
  dates: c.dates.map((d) => ({
    ...d,
    eventDate: d.eventDate.toISOString().slice(0, 10),
  })),
});
const json = (value: unknown) => value as Prisma.InputJsonValue;
function conflict(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  )
    throw new JointLeaveError(
      "CONFLICT",
      "Tanggal/kunci perintah sudah digunakan. Muat ulang klaim sebelum mencoba lagi.",
    );
  throw error;
}
async function blocking(
  db: Prisma.TransactionClient,
  employeeId: string,
  dates: readonly string[],
) {
  const rows = await db.jointLeaveClaimDate.findMany({
    where: {
      employeeId,
      eventDate: { in: dates.map((d) => new Date(d + "T00:00:00Z")) },
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: { eventDate: true },
  });
  return rows.map((r) => r.eventDate.toISOString().slice(0, 10));
}
class Transaction implements JointLeaveTransaction {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async policy(id: string) {
    const p = await this.db.jointLeavePolicy.findUnique({
      where: { id },
      include: { eventDates: true },
    });
    return p ? policy(p) : null;
  }
  async claim(id: string) {
    const c = await this.db.jointLeaveClaim.findUnique({
      where: { id },
      include,
    });
    return c ? claim(c) : null;
  }
  async retry(idempotencyKey: string) {
    const c = await this.db.jointLeaveClaim.findUnique({
      where: { idempotencyKey },
      include,
    });
    return c ? claim(c) : null;
  }
  async reviewRetry(reviewKey: string) {
    const c = await this.db.jointLeaveClaim.findUnique({
      where: { reviewKey },
      include,
    });
    return c ? claim(c) : null;
  }
  blockingDates(employeeId: string, dates: readonly string[]) {
    return blocking(this.db, employeeId, dates);
  }
  async create(input: ClaimCreate) {
    const { dates, policySnapshot, ...data } = input;
    const employee = await this.db.employee.findUniqueOrThrow({
      where: { id: input.employeeId },
    });
    await this.db.jointLeaveClaim.create({
      data: {
        ...data,
        employeeNameSnapshot: employee.fullName,
        employeeNipSnapshot: employee.nip,
        policySnapshot: json(policySnapshot),
      },
    });
    await this.db.jointLeaveClaimDate.createMany({
      data: dates.map((d) => ({
        id: randomUUID(),
        claimId: input.id,
        employeeId: input.employeeId,
        policyId: input.policyId,
        eventId: d.eventId,
        eventDate: new Date(d.eventDate + "T00:00:00Z"),
        status: "PENDING",
      })),
    });
    return (await this.claim(input.id))!;
  }
  async accounts(
    employeeId: string,
    year: number,
  ): Promise<AnnualBalanceAccountState[]> {
    await this.db
      .$queryRaw`SELECT "id" FROM "AnnualBalanceAccount" WHERE "employeeId"=${employeeId}::uuid AND "entitlementYear"=${year} ORDER BY CASE "bucket" WHEN 'JOINT_LEAVE_CLAIM' THEN 1 WHEN 'N2' THEN 2 WHEN 'N1' THEN 3 ELSE 4 END FOR UPDATE`;
    const rows = await this.db.annualBalanceAccount.findMany({
      where: { employeeId, entitlementYear: year },
    });
    return rows.map((r) => ({
      ...r,
      availableDays: r.grantedDays - r.reservedDays - r.committedDays,
    }));
  }
  approvedDays(employeeId: string, creditYear: number) {
    return this.db.jointLeaveClaimDate.count({
      where: { employeeId, status: "APPROVED", claim: { creditYear } },
    });
  }
  async hasDownstreamRollover(employeeId: string, year: number) {
    return (
      (await this.db.annualRolloverCommit.count({
        where: { employeeId, targetYear: { gt: year, lte: year + 2 } },
      })) > 0
    );
  }
  async grant(
    c: Claim,
    eventIds: readonly string[],
    now: Date,
    reason: string,
  ) {
    for (const eventId of eventIds) {
      const d = c.dates.find((d) => d.eventId === eventId)!;
      const op = await this.db.annualBalanceOperation.create({
        data: {
          employeeId: c.employeeId,
          entitlementYear: c.creditYear,
          bucket: "JOINT_LEAVE_CLAIM",
          operationType: "GRANT",
          days: 1,
          occurredAt: now,
          idempotencyKey: `${c.id}:joint:${d.id}`,
          referenceType: "JOINT_LEAVE_CLAIM",
          referenceId: c.id,
          reason,
        },
      });
      await this.db.jointLeaveClaimDate.update({
        where: { id: d.id },
        data: { status: "APPROVED", operationId: op.id },
      });
    }
    if (eventIds.length)
      await this.db.annualBalanceAccount.update({
        where: {
          employeeId_entitlementYear_bucket: {
            employeeId: c.employeeId,
            entitlementYear: c.creditYear,
            bucket: "JOINT_LEAVE_CLAIM",
          },
        },
        data: { grantedDays: { increment: eventIds.length } },
      });
  }
  async decide(
    c: Claim,
    input: ReviewInput,
    actor: Principal,
    now: Date,
    hash: string,
    snapshot: object,
  ) {
    await this.db.jointLeaveClaimDate.updateMany({
      where: { claimId: c.id, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    const count = await this.db.jointLeaveClaim.updateMany({
      where: { id: c.id, status: "SUBMITTED" },
      data: {
        status: input.approvedEventIds.length ? "APPROVED" : "REJECTED",
        reviewKey: input.idempotencyKey,
        reviewHash: hash,
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        reason: input.reason,
        reviewSnapshot: json(snapshot),
      },
    });
    if (count.count !== 1)
      throw new JointLeaveError("CONFLICT", "Klaim sudah diputuskan.");
    return (await this.claim(c.id))!;
  }
}
export class PrismaJointLeaveRepository implements JointLeaveRepository {
  constructor(private readonly db: PrismaClient) {}
  async policies(creditYear: number) {
    return (
      await this.db.jointLeavePolicy.findMany({
        where: { creditYear },
        include: { eventDates: true },
        orderBy: { createdAt: "desc" },
      })
    ).map(policy);
  }
  async createPolicy(
    input: PolicyInput,
    actor: Principal,
    key: string,
    hash: string,
  ) {
    try {
      return await this.db.$transaction(async (db) => {
        // Serialize configuration commands with identical keys, including commands for different years.
        await db.$queryRaw<
          { locked: number }[]
        >`SELECT 1::integer AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 107))) AS advisory_lock_call`;
        const retry = await db.jointLeavePolicy.findUnique({
          where: { commandKey: key },
          include: { eventDates: true },
        });
        if (retry) {
          if (
            retry.createdByUserId !== actor.userId ||
            retry.payloadHash !== hash
          )
            throw new JointLeaveError(
              "CONFLICT",
              "Kunci pengaturan sudah dipakai untuk data berbeda.",
            );
          return policy(retry);
        }
        await db.$queryRaw<
          { locked: number }[]
        >`SELECT 1::integer AS locked FROM (SELECT pg_advisory_xact_lock(107, ${input.creditYear})) AS annual_configuration_lock`;
        // Publication selects the prospective version. Existing claims retain their own snapshot.
        await db.jointLeavePolicy.updateMany({
          where: { creditYear: input.creditYear, isActive: true },
          data: { isActive: false },
        });
        const p = await db.jointLeavePolicy.create({
          data: {
            name: input.name,
            applicableYear: input.creditYear,
            creditYear: input.creditYear,
            quotaDays: input.quotaDays,
            sourceReference: input.sourceReference,
            claimOpensAt: new Date(`${input.creditYear}-01-01T00:00:00+07:00`),
            claimDeadlineAt: new Date(
              `${input.creditYear}-12-31T23:59:59.999+07:00`,
            ),
            commandKey: key,
            payloadHash: hash,
            createdByUserId: actor.userId,
            eventDates: {
              create: input.events.map((e) => ({
                eventDate: new Date(e.date + "T00:00:00Z"),
                name: e.name,
                kind: e.kind,
              })),
            },
          },
          include: { eventDates: true },
        });
        return policy(p);
      });
    } catch (e) {
      conflict(e);
    }
  }
  async list(actor: Principal, q: ClaimQuery) {
    const where: Prisma.JointLeaveClaimWhereInput = {
      creditYear: q.year,
      ...(actor.role === "PEGAWAI" ? { employeeId: actor.employeeId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              {
                employee: {
                  fullName: { contains: q.search, mode: "insensitive" },
                },
              },
              {
                employee: { nip: { contains: q.search, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.jointLeaveClaim.findMany({
        where,
        include,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 10,
        skip: (q.page - 1) * 10,
      }),
      this.db.jointLeaveClaim.count({ where }),
    ]);
    return { claims: rows.map(claim), total };
  }
  claim(id: string) {
    return new Transaction(this.db).claim(id);
  }
  retry(key: string) {
    return new Transaction(this.db).retry(key);
  }
  blockingDates(employeeId: string, dates: readonly string[]) {
    return blocking(this.db, employeeId, dates);
  }
  async withEmployee<T>(
    employeeId: string,
    work: (tx: JointLeaveTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        async (db) => {
          const rows = await db.$queryRaw<
            { id: string }[]
          >`SELECT "id" FROM "Employee" WHERE "id"=${employeeId}::uuid FOR UPDATE`;
          if (!rows.length)
            throw new JointLeaveError("NOT_FOUND", "Pegawai tidak ditemukan.");
          return work(new Transaction(db));
        },
        { maxWait: 10000, timeout: 20000 },
      );
    } catch (e) {
      conflict(e);
    }
  }
}
