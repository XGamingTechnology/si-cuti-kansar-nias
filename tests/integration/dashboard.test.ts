import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaDashboardReader } from "@/infrastructure/dashboard/reader";
import { DashboardService } from "@/application/dashboard/contracts";
import { OverlayService } from "@/application/dashboard/overlay";
import { PrismaOverlayRepository } from "@/infrastructure/dashboard/overlay-repository";
import type { Principal } from "@/modules/auth/service";
const run =
  process.env.DATABASE_URL && process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1"
    ? describe
    : describe.skip;
run("M6 read projections and publication on disposable PostgreSQL", () => {
  const db = createDatabaseClient();
  const reader = new PrismaDashboardReader(db);
  const clock = () => new Date("2026-12-31T17:00:00Z");
  const service = new DashboardService(reader, clock);
  const overlays = new OverlayService(new PrismaOverlayRepository(db), clock);
  let admin: Principal,
    a: Principal,
    b: Principal,
    returnedId: string,
    currentRevisionId: string,
    privateType: string,
    ownInactiveType: string;
  let priorPendingLeave = 0,
    priorPendingPermission = 0;
  const ids: string[] = [];
  const permissionIds: string[] = [];
  const params = (extra = "") =>
    new URLSearchParams(`kind=leave&from=2026-12-30&to=2027-01-03${extra}`);
  async function actor(role: Principal["role"]) {
    const employee = await db.employee.create({
      data: {
        nip: `M6-${randomUUID().slice(0, 28)}`,
        fullName: `Pengguna M6 Sintetis ${role}`,
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
        isActive: true,
      },
    });
    const user = await db.user.create({
      data: { employeeId: employee.id, role },
    });
    return {
      employeeId: employee.id,
      userId: user.id,
      fullName: employee.fullName,
      role,
    };
  }
  async function leave(
    actor: Principal,
    status:
      | "APPROVED"
      | "DRAFT"
      | "SUBMITTED"
      | "RETURNED_FOR_CORRECTION"
      | "REJECTED"
      | "CANCELLED",
    from = "2026-12-30",
    to = "2027-01-03",
    multi = false,
  ) {
    const q = await db.leaveRequest.create({
      data: {
        employeeId: actor.employeeId,
        status,
        currentRevisionNumber: multi ? 2 : 1,
      },
    });
    ids.push(q.id);
    const rev = await db.leaveRequestRevision.create({
      data: {
        leaveRequestId: q.id,
        revisionNumber: multi ? 2 : 1,
        leaveType: "ANNUAL",
        startDate: new Date(from),
        endDate: new Date(to),
        reason: "PRIVATE_REASON_DO_NOT_LEAK",
        leaveAddress: "PRIVATE_ADDRESS",
        leavePhone: "PRIVATE_PHONE",
        calculatedWorkingDays: 3,
      },
    });
    if (multi)
      await db.leaveRequestRevision.create({
        data: {
          leaveRequestId: q.id,
          revisionNumber: 1,
          leaveType: "SICK",
          startDate: new Date("2025-01-01"),
          endDate: new Date("2025-01-02"),
          reason: "OLD_PRIVATE_REVISION",
        },
      });
    return { q, rev };
  }
  beforeAll(async () => {
    admin = await actor("ADMIN_KEPEGAWAIAN");
    a = await actor("PEGAWAI");
    b = await actor("PEGAWAI");
    const baseline = (await service.read(admin, "summary", params())) as {
      fixed: { pendingLeave: number; pendingPermission: number };
    };
    priorPendingLeave = baseline.fixed.pendingLeave;
    priorPendingPermission = baseline.fixed.pendingPermission;

    const f = await leave(a, "APPROVED", undefined, undefined, true);
    returnedId = f.q.id;
    currentRevisionId = f.rev.id;
    await db.leaveRequestRevision.create({
      data: {
        leaveRequestId: f.q.id,
        revisionNumber: 3,
        leaveType: "SICK",
        startDate: new Date("2026-12-30"),
        endDate: new Date("2027-01-03"),
        reason: "PRIVATE_HIGHER_UNREFERENCED_REVISION",
      },
    });

    await leave(a, "APPROVED", "2027-01-01", "2027-01-01");
    await leave(b, "APPROVED", "2027-01-01", "2027-01-01");
    for (const status of [
      "DRAFT",
      "SUBMITTED",
      "RETURNED_FOR_CORRECTION",
      "REJECTED",
      "CANCELLED",
    ] as const)
      await leave(a, status);
    await leave(a, "SUBMITTED", "2020-01-01", "2020-01-02");
    const type = await db.permissionType.create({
      data: {
        code: `M6-${randomUUID()}`,
        name: "Izin Sintetis Nonaktif",
        isActive: false,
      },
    });
    ownInactiveType = type.id;
    const foreign = await db.permissionType.create({
      data: {
        code: `M6-${randomUUID()}`,
        name: "Izin Pegawai Lain",
        isActive: false,
      },
    });
    privateType = foreign.id;
    for (const [actor, t] of [
      [a, type.id],
      [b, foreign.id],
    ] as const) {
      const q = await db.permissionRequest.create({
        data: { employeeId: actor.employeeId, status: "SUBMITTED" },
      });
      permissionIds.push(q.id);
      await db.permissionRequestRevision.create({
        data: {
          permissionRequestId: q.id,
          revisionNumber: 1,
          permissionTypeId: t,
          startDate: new Date("2020-01-01"),
          endDate: new Date("2020-01-02"),
          reason: "PRIVATE_PERMISSION_REASON",
        },
      });
    }
    await db.annualBalanceAccount.createMany({
      data: [
        {
          employeeId: a.employeeId,
          entitlementYear: 2027,
          bucket: "N",
          grantedDays: 12,
          reservedDays: 2,
          committedDays: 3,
        },
        {
          employeeId: a.employeeId,
          entitlementYear: 2027,
          bucket: "N1",
          grantedDays: 6,
          reservedDays: 1,
          committedDays: 1,
        },
        {
          employeeId: a.employeeId,
          entitlementYear: 2027,
          bucket: "N2",
          grantedDays: 6,
        },
        {
          employeeId: a.employeeId,
          entitlementYear: 2027,
          bucket: "JOINT_LEAVE_CLAIM",
          grantedDays: 9,
        },
      ],
    });
    const doc = await db.leaveDocument.create({
      data: {
        leaveRequestId: returnedId,
        revisionId: currentRevisionId,
        documentType: "RETURN_BASIS",
        storageKey: randomUUID().replaceAll("-", ""),
        checksumSha256: "b".repeat(64),
        sizeBytes: 100,
        snapshot: { private: "PRIVATE_SNAPSHOT" },
      },
    });
    for (const days of [1, 2])
      await db.leaveBalanceReturn.create({
        data: {
          id: randomUUID(),
          leaveRequestId: returnedId,
          revisionId: currentRevisionId,
          entitlementYear: 2027,
          restoredDays: days,
          reason: "PRIVATE_RETURN_REASON",
          basisReference: "PRIVATE_SOURCE_REFERENCE",
          basisDate: new Date("2027-01-01"),
          evidenceDocumentId: doc.id,
          recordedByUserId: admin.userId,
          recordedAt: clock(),
          idempotencyKey: randomUUID(),
          payloadHash: "a".repeat(64),
          policyVersion: "m6-synthetic",
          snapshot: { private: "PRIVATE_RETURN_SNAPSHOT" },
        },
      });
    const partial = await leave(a, "APPROVED", "2027-01-04", "2027-01-06");
    const partialDoc = await db.leaveDocument.create({
      data: {
        leaveRequestId: partial.q.id,
        revisionId: partial.rev.id,
        documentType: "RETURN_BASIS",
        storageKey: randomUUID().replaceAll("-", ""),
        checksumSha256: "c".repeat(64),
        sizeBytes: 100,
        snapshot: {},
      },
    });
    await db.leaveBalanceReturn.create({
      data: {
        id: randomUUID(),
        leaveRequestId: partial.q.id,
        revisionId: partial.rev.id,
        entitlementYear: 2027,
        restoredDays: 1,
        reason: "Private partial return",
        basisReference: "Private partial basis",
        basisDate: new Date("2027-01-07"),
        evidenceDocumentId: partialDoc.id,
        recordedByUserId: admin.userId,
        recordedAt: clock(),
        idempotencyKey: randomUUID(),
        payloadHash: "c".repeat(64),
        policyVersion: "m6-synthetic",
        snapshot: {},
      },
    });
  });
  // Version/audit records are intentionally retained; dispose this dedicated DB after use.
  afterAll(async () => {
    await db.leaveBalanceReturn.deleteMany({
      where: { leaveRequestId: { in: ids } },
    });
    await db.leaveDocument.deleteMany({
      where: { leaveRequestId: { in: ids } },
    });
    await db.leaveRequestRevision.deleteMany({
      where: { leaveRequestId: { in: ids } },
    });
    await db.leaveRequest.deleteMany({ where: { id: { in: ids } } });
    await db.permissionRequestRevision.deleteMany({
      where: { permissionRequestId: { in: permissionIds } },
    });
    await db.permissionRequest.deleteMany({
      where: { id: { in: permissionIds } },
    });
    await db.$disconnect();
  });
  it("counts only current revision and inclusive cross-year overlap; no private DTO leakage", async () => {
    const agenda = (await service.read(a, "agenda", params())) as {
      items: {
        requestId: string;
        hasBalanceReturn: boolean;
        startDate: string;
        endDate: string;
      }[];
      total: number;
    };
    expect(agenda.total).toBe(2);
    expect(agenda.items).toHaveLength(2);
    expect(agenda.items.find((v) => v.requestId === returnedId)).toMatchObject({
      hasBalanceReturn: true,
      typeId: "ANNUAL",
      startDate: "2026-12-30",
      endDate: "2027-01-03",
    });
    const json = JSON.stringify(agenda);
    for (const field of [
      "reason",
      "leaveAddress",
      "leavePhone",
      "storageKey",
      "snapshot",
      "PRIVATE_",
      "employee",
    ])
      expect(json).not.toContain(field);
    const old = (await service.read(
      a,
      "agenda",
      new URLSearchParams("kind=leave&from=2025-01-01&to=2025-01-02"),
    )) as { total: number };
    expect(old.total).toBe(0);
  });
  it("separates request counts from distinct employees and all-period fixed cards from filters", async () => {
    const summary = (await service.read(
      admin,
      "summary",
      params(`&employeeId=${b.employeeId}&status=REJECTED`),
    )) as {
      fixed: {
        pendingLeave: number;
        pendingPermission: number;
        approvedTodayEmployees: number;
      };
      groups: unknown[];
    };
    expect(summary.fixed).toMatchObject({
      pendingLeave: priorPendingLeave + 2,
      pendingPermission: priorPendingPermission + 2,
      approvedTodayEmployees: 2,
    });
    expect(summary.groups).toHaveLength(0);
    const period = (await service.read(admin, "summary", params())) as {
      groups: { count: number }[];
    };
    expect(period.groups.reduce((s, v) => s + v.count, 0)).toBe(3);
  });
  it("uses WIB day boundary, not server UTC current_date", async () => {
    const earlier = new DashboardService(
      reader,
      () => new Date("2026-12-31T16:59:59Z"),
    );
    const before = (await earlier.read(admin, "summary", params())) as {
      fixed: { approvedTodayEmployees: number };
      businessDate: string;
    };
    const after = (await service.read(
      admin,
      "summary",
      params(),
    )) as typeof before;
    expect(before.businessDate).toBe("2026-12-31");
    expect(before.fixed.approvedTodayEmployees).toBe(1);
    expect(after.businessDate).toBe("2027-01-01");
    expect(after.fixed.approvedTodayEmployees).toBe(2);
  });
  it("keeps partially/fully returned APPROVED periods and does not multiply multi-return counts", async () => {
    const data = (await service.read(a, "calendar", params())) as {
      days: { date: string; requestCount: number }[];
      uniqueRequestCount: number;
    };
    expect(data.days).toHaveLength(5);
    expect(data.days.find((v) => v.date === "2026-12-30")?.requestCount).toBe(
      1,
    );
    expect(data.days.find((v) => v.date === "2027-01-01")?.requestCount).toBe(
      2,
    );
    expect(data.uniqueRequestCount).toBe(2);
  });
  it("marks partial return without inferring an actual-use date or shortening approval", async () => {
    const value = (await service.read(
      a,
      "agenda",
      new URLSearchParams("kind=leave&from=2027-01-04&to=2027-01-06"),
    )) as {
      items: {
        hasBalanceReturn: boolean;
        startDate: string;
        endDate: string;
      }[];
      total: number;
    };
    expect(value.total).toBe(1);
    expect(value.items[0]).toMatchObject({
      hasBalanceReturn: true,
      startDate: "2027-01-04",
      endDate: "2027-01-06",
    });
  });
  it("all non-draft statuses are filterable without showing draft as leave", async () => {
    const all = (await service.read(a, "agenda", params("&status=all"))) as {
      items: { status: string }[];
      total: number;
    };
    expect(all.total).toBe(6);
    expect(all.items.some((v) => v.status === "DRAFT")).toBe(false);
    for (const status of [
      "SUBMITTED",
      "RETURNED_FOR_CORRECTION",
      "REJECTED",
      "CANCELLED",
    ]) {
      const data = (await service.read(
        a,
        "agenda",
        params(`&status=${status}`),
      )) as { items: { status: string }[]; total: number };
      expect(data.total).toBe(1);
      expect(data.items[0].status).toBe(status);
    }
  });
  it("paginates server-side with date/UUID ties and total independent of page", async () => {
    const first = (await service.read(admin, "agenda", params("&limit=1"))) as {
      items: { requestId: string }[];
      total: number;
      nextCursor: string;
    };
    const second = (await service.read(
      admin,
      "agenda",
      params(`&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
    )) as typeof first;
    const third = (await service.read(
      admin,
      "agenda",
      params(`&limit=1&cursor=${encodeURIComponent(second.nextCursor)}`),
    )) as typeof first;
    expect(first.total).toBe(3);
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map(
          (v) => v.requestId,
        ),
      ).size,
    ).toBe(3);
    expect(third.nextCursor).toBeNull();
    await expect(
      service.read(
        b,
        "agenda",
        params(`&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
      ),
    ).rejects.toThrow();
  });
  it("projects Admin employee labels but never exposes another owner's data/types to Pegawai", async () => {
    const result = (await service.read(
      admin,
      "agenda",
      params(`&employeeId=${b.employeeId}`),
    )) as { items: { employee: { id: string } }[]; total: number };
    expect(result.total).toBe(1);
    expect(result.items[0].employee.id).toBe(b.employeeId);
    const own = (await service.read(
      a,
      "summary",
      new URLSearchParams(
        "kind=permission&from=2020-01-01&to=2020-01-31&status=SUBMITTED",
      ),
    )) as { types: { id: string }[]; groups: unknown[] };
    expect(own.types.some((v) => v.id === ownInactiveType)).toBe(true);
    expect(own.types.some((v) => v.id === privateType)).toBe(false);
    expect(own.groups).toHaveLength(1);
  });
  it("reads existing balance counters/readiness without initializing missing accounts or writing ledger", async () => {
    const count = await db.annualBalanceOperation.count();
    expect(await service.balance(a)).toMatchObject({
      year: 2027,
      readiness: "INITIALIZED",
      totalAvailableDays: 26,
      buckets: expect.arrayContaining([
        { bucket: "N", availableDays: 7 },
        { bucket: "JOINT_LEAVE_CLAIM", availableDays: 9 },
      ]),
    });
    expect(await service.balance(b)).toMatchObject({
      readiness: "UNINITIALIZED",
      buckets: [],
    });
    expect(await db.annualBalanceOperation.count()).toBe(count);
    expect(
      await db.annualBalanceAccount.count({
        where: { employeeId: b.employeeId },
      }),
    ).toBe(0);
  });
  it("returns PARTIAL with no numerical balance for incomplete over-granted own accounts", async () => {
    await db.annualBalanceAccount.create({
      data: {
        employeeId: b.employeeId,
        entitlementYear: 2027,
        bucket: "N1",
        grantedDays: 7,
        committedDays: 2,
      },
    });
    expect(await service.balance(b)).toMatchObject({
      readiness: "PARTIAL",
      totalAvailableDays: null,
      buckets: [],
    });
    expect(
      await db.annualBalanceAccount.count({
        where: { employeeId: b.employeeId },
      }),
    ).toBe(1);
  });
  const payload = (year: number) => ({
    year,
    sourceReference: "Dokumen sumber sintetis, bukan kalender resmi",
    sourcePublishedOn: "2026-12-01",
    sourceUrl: "",
    events: [
      {
        date: `${year}-01-01`,
        name: "Event sintetis pengujian",
        category: "PUBLIC_HOLIDAY",
      },
    ],
  });
  async function command(year: number) {
    const p = await overlays.preview(admin, payload(year));
    return {
      data: p.data,
      expectedVersion: p.expectedVersion,
      fingerprint: p.fingerprint,
      idempotencyKey: randomUUID(),
      confirmed: true as const,
    };
  }
  async function unchanged() {
    return {
      accounts: await db.annualBalanceAccount.findMany({
        where: { employeeId: a.employeeId },
      }),
      operations: await db.annualBalanceOperation.count(),
      exceptions: await db.workingCalendarException.count(),
      leave: await db.leaveRequest.findUnique({ where: { id: returnedId } }),
      revision: await db.leaveRequestRevision.findUnique({
        where: { id: currentRevisionId },
      }),
      documents: await db.leaveDocument.findMany({
        where: { leaveRequestId: returnedId },
      }),
    };
  }
  it("publishes atomically, retries idempotently, preserves immutable source versions and does not mutate leave/balance", async () => {
    const before = await unchanged();
    const input = await command(2081);
    const results = await Promise.all([
      overlays.publish(admin, input),
      overlays.publish(admin, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].actorUserId).toBe(admin.userId);
    expect(results[0].publishedAt).toBe(clock().toISOString());
    const p = await overlays.preview(admin, {
      ...payload(2081),
      events: [
        {
          date: "2081-01-02",
          name: "Event sintetis revisi",
          category: "JOINT_LEAVE",
        },
      ],
    });
    expect(p.diff.removed).toHaveLength(1);
    const second = await overlays.publish(admin, {
      data: p.data,
      expectedVersion: p.expectedVersion,
      fingerprint: p.fingerprint,
      idempotencyKey: randomUUID(),
      confirmed: true,
    });
    expect(second.version).toBe(results[0].version + 1);
    expect((await overlays.read(a, 2081)).dataset?.events[0].date).toBe(
      "2081-01-02",
    );
    const history = await overlays.history(
      admin,
      new URLSearchParams("year=2081&limit=1"),
    );
    expect(history.versions).toHaveLength(1);
    expect(history.nextBefore).toBe(second.version);
    expect(await unchanged()).toEqual(before);
    await expect(
      db.calendarOverlayVersion.update({
        where: { id: second.id },
        data: { sourceReference: "rewrite" },
      }),
    ).rejects.toThrow();
    await expect(
      db.calendarOverlayVersion.delete({ where: { id: second.id } }),
    ).rejects.toThrow();
    await expect(
      db.user.delete({ where: { id: admin.userId } }),
    ).rejects.toThrow();
  });
  it("rejects concurrent stale publication without replacing the winner", async () => {
    const c = await command(2082);
    const other = await overlays.preview(admin, {
      ...payload(2082),
      sourceReference: "Dokumen sintetis lain",
    });
    const results = await Promise.allSettled([
      overlays.publish(admin, c),
      overlays.publish(admin, {
        data: other.data,
        expectedVersion: other.expectedVersion,
        fingerprint: other.fingerprint,
        idempotencyKey: randomUUID(),
        confirmed: true,
      }),
    ]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(results.find((v) => v.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  it("publication FK/audit failure rolls back and never exposes a partial dataset", async () => {
    const fake = { ...admin, userId: randomUUID() };
    const p = await overlays.preview(fake, payload(2083));
    await expect(
      overlays.publish(fake, {
        data: p.data,
        expectedVersion: p.expectedVersion,
        fingerprint: p.fingerprint,
        idempotencyKey: randomUUID(),
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect((await overlays.read(a, 2083)).status).toBe("UNAVAILABLE");
  });
  it("denies employee management and history without hiding only UI controls", async () => {
    await expect(overlays.preview(a, payload(2084))).rejects.toThrow(
      "Forbidden",
    );
    await expect(
      overlays.history(a, new URLSearchParams("year=2081")),
    ).rejects.toThrow("Forbidden");
    expect(() => overlays.publish(a, {})).toThrow("Forbidden");
  });
});
