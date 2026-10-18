import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaReportRepository } from "@/infrastructure/reporting/repository";
import { PrismaReportReader } from "@/infrastructure/reporting/reader";
import { ReportingService } from "@/application/reporting/service";
import { LocalReportFiles } from "@/infrastructure/reporting/files";
import { ReportRenderersAdapter } from "@/infrastructure/reporting/renderers";
import { purgeReportFiles } from "@/infrastructure/reporting/cleanup";
import {
  DEFINITION,
  type ReportActor,
} from "@/application/reporting/contracts";
import { reportFilters } from "../support/reporting";
const run =
  process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1" && process.env.DATABASE_URL
    ? describe
    : describe.skip;
run(
  "M7 actual PostgreSQL snapshots, authorization, audits and retention",
  () => {
    const db = createDatabaseClient(),
      reader = new PrismaReportReader(db),
      repo = new PrismaReportRepository(db);
    let root: string,
      files: LocalReportFiles,
      service: ReportingService,
      a: ReportActor,
      b: ReportActor,
      employee: ReportActor,
      nonactive: ReportActor,
      current: string,
      currentRevision: string,
      permissionType: string;
    let now = new Date("2026-12-31T17:00:00.000Z");
    const employeeIds: string[] = [];
    const clock = () => now,
      body = (extra: object = {}) => ({
        ...reportFilters(),
        employeeId: employee.employeeId,
        idempotencyKey: randomUUID(),
        ...extra,
      });
    async function actor(role: ReportActor["role"]) {
      const e = await db.employee.create({
        data: {
          nip: `M7-${randomUUID().slice(0, 28)}`,
          fullName: `Pegawai M7 Sintetis ${randomUUID().slice(0, 6)}`,
          positionTitle: "Penguji",
          workUnit: "M7 Unit %_ Sintetis",
        },
      });
      employeeIds.push(e.id);
      const u = await db.user.create({ data: { employeeId: e.id, role } });
      return { userId: u.id, employeeId: e.id, fullName: e.fullName, role };
    }
    async function leave(
      owner: ReportActor,
      status:
        | "APPROVED"
        | "SUBMITTED"
        | "REJECTED"
        | "RETURNED_FOR_CORRECTION"
        | "CANCELLED"
        | "DRAFT" = "APPROVED",
      start = "2026-12-31",
      end = "2027-01-02",
    ) {
      const q = await db.leaveRequest.create({
        data: {
          employeeId: owner.employeeId,
          status,
          currentRevisionNumber: 2,
          revisions: {
            create: [
              {
                revisionNumber: 1,
                leaveType: "SICK",
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-01-01"),
                reason: "PRIVATE_OLD",
              },
              {
                revisionNumber: 2,
                leaveType: "ANNUAL",
                startDate: new Date(start),
                endDate: new Date(end),
                reason: "PRIVATE_REASON",
                leaveAddress: "PRIVATE_ADDRESS",
                leavePhone: "PRIVATE_PHONE",
                submittedAt: new Date("2026-12-30T17:00:00Z"),
                calculatedWorkingDays: 5,
              },
              {
                revisionNumber: 3,
                leaveType: "SICK",
                startDate: new Date("2023-01-01"),
                endDate: new Date("2023-01-01"),
                reason: "PRIVATE_HIGHER_UNREFERENCED",
              },
            ],
          },
        },
      });
      const revision = (
        await db.leaveRequestRevision.findUniqueOrThrow({
          where: {
            leaveRequestId_revisionNumber: {
              leaveRequestId: q.id,
              revisionNumber: 2,
            },
          },
        })
      ).id;
      return { id: q.id, revision };
    }
    async function returned(request: string, revision: string, days: number) {
      const doc = await db.leaveDocument.create({
        data: {
          leaveRequestId: request,
          revisionId: revision,
          documentType: "RETURN_BASIS",
          version:
            1 +
            (await db.leaveDocument.count({
              where: { revisionId: revision, documentType: "RETURN_BASIS" },
            })),
          storageKey: randomUUID().replaceAll("-", ""),
          checksumSha256: "a".repeat(64),
          sizeBytes: 10,
          snapshot: { secret: "PRIVATE_DOC" },
        },
      });
      return db.leaveBalanceReturn.create({
        data: {
          id: randomUUID(),
          leaveRequestId: request,
          revisionId: revision,
          entitlementYear: 2026,
          restoredDays: days,
          reason: "PRIVATE_RETURN_REASON",
          basisReference: "PRIVATE_BASIS",
          basisDate: new Date("2027-01-01"),
          evidenceDocumentId: doc.id,
          recordedByUserId: a.userId,
          recordedAt: now,
          idempotencyKey: randomUUID(),
          payloadHash: "b".repeat(64),
          policyVersion: "test",
          snapshot: { private: "PRIVATE_SNAPSHOT" },
        },
      });
    }
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "m7-db-"));
      files = new LocalReportFiles(root, root + "-docs", clock);
      service = new ReportingService(
        repo,
        reader,
        files,
        new ReportRenderersAdapter(),
        "synthetic-test-".repeat(4),
        clock,
      );
      a = await actor("ADMIN_KEPEGAWAIAN");
      b = await actor("ADMIN_KEPEGAWAIAN");
      employee = await actor("PEGAWAI");
      nonactive = await actor("PEGAWAI");
      await db.employee.update({
        where: { id: nonactive.employeeId },
        data: { isActive: false },
      });
      const q = await leave(employee);
      current = q.id;
      currentRevision = q.revision;
      await returned(current, currentRevision, 1);
      await returned(current, currentRevision, 2);
      await leave(nonactive);
      const t = await db.permissionType.create({
        data: {
          code: `M7-${randomUUID().slice(0, 8)}`,
          name: "Izin Sintetis Historis",
          isActive: false,
        },
      });
      permissionType = t.id;
      await db.permissionRequest.create({
        data: {
          employeeId: employee.employeeId,
          status: "APPROVED",
          currentRevisionNumber: 2,
          revisions: {
            create: [
              {
                revisionNumber: 1,
                permissionTypeId: t.id,
                startDate: new Date("2023-01-01"),
                endDate: new Date("2023-01-01"),
                reason: "PRIVATE_OLD",
              },
              {
                revisionNumber: 2,
                permissionTypeId: t.id,
                startDate: new Date("2026-12-31"),
                endDate: new Date("2027-01-02"),
                reason: "PRIVATE_PERMISSION",
                submittedAt: new Date("2026-12-30T17:00:00Z"),
              },
            ],
          },
        },
      });
    });
    afterAll(async () => {
      // Keep immutable report/audit actors in this disposable DB, but remove this suite's mutable
      // workflow fixtures so existing global M6 count tests never observe another suite's requests.
      const qs = await db.leaveRequest.findMany({
          where: { employeeId: { in: employeeIds } },
          select: { id: true },
        }),
        ids = qs.map((q) => q.id);
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
      const ps = await db.permissionRequest.findMany({
          where: { employeeId: { in: employeeIds } },
          select: { id: true },
        }),
        pids = ps.map((p) => p.id);
      await db.permissionRequestRevision.deleteMany({
        where: { permissionRequestId: { in: pids } },
      });
      await db.permissionRequest.deleteMany({ where: { id: { in: pids } } });
      await db.$disconnect();
      await rm(root, { recursive: true, force: true });
    });
    it("uses explicit current pointer, inclusive cross-year overlap, EXISTS returns and minimal DTO", async () => {
      const p = await service.create(a, body());
      expect(p.items).toHaveLength(1);
      expect(p.items[0]).toMatchObject({
        requestId: current,
        revisionId: currentRevision,
        revisionNumber: 2,
        startDate: "2026-12-31",
        endDate: "2027-01-02",
        hasBalanceReturn: true,
        workingDays: 5,
      });
      expect(p.summary).toMatchObject({
        requests: 1,
        employees: 1,
        withBalanceReturn: 1,
      });
      expect(JSON.stringify(p)).not.toMatch(
        /PRIVATE_|reason|storageKey|leaveAddress|leavePhone/,
      );
      const last = await service.create(
        a,
        body({ from: "2027-01-02", to: "2027-01-02" }),
      );
      expect(last.items).toHaveLength(1);
      const outside = await service.create(
        a,
        body({ from: "2027-01-03", to: "2027-01-03" }),
      );
      expect(outside.items).toHaveLength(0);
    });
    it("keeps inactive employees and inactive permission types, separates Cuti/Izin", async () => {
      const p = await service.create(
        a,
        body({ employeeId: nonactive.employeeId }),
      );
      expect(p.items[0].active).toBe(false);
      expect(
        (
          await service.create(
            a,
            body({ employeeId: nonactive.employeeId, activeState: "active" }),
          )
        ).items,
      ).toHaveLength(0);
      const permit = await service.create(
        a,
        body({ reportCode: "PERMISSION_REQUESTS", type: permissionType }),
      );
      expect(permit.items[0]).toMatchObject({
        typeLabel: "Izin Sintetis Historis",
        workingDays: null,
        hasBalanceReturn: false,
        revisionNumber: 2,
      });
    });
    it("distinct employee differs from request count and literal LIKE filters do not widen", async () => {
      const q = await leave(employee);
      await db.employee.update({
        where: { id: employee.employeeId },
        data: { fullName: "Pegawai Sintetis %_ literal" },
      });
      const p = await service.create(
        a,
        body({ search: "%_", workUnit: "M7 Unit %_ Sintetis" }),
      );
      expect(p.summary.requests).toBe(2);
      expect(p.summary.employees).toBe(1);
      expect(p.items.map((r) => r.requestId)).toContain(q.id);
      expect(
        (await service.create(a, body({ search: "' OR TRUE --" }))).items,
      ).toHaveLength(0);
    });
    it("default/filter statuses exclude draft without pretending a historic period-end status", async () => {
      for (const s of [
        "SUBMITTED",
        "REJECTED",
        "RETURNED_FOR_CORRECTION",
        "CANCELLED",
        "DRAFT",
      ] as const)
        await leave(employee, s);
      expect(
        (await service.create(a, body({ status: "ALL_NON_DRAFT" }))).summary
          .requests,
      ).toBe(6);
      for (const s of [
        "SUBMITTED",
        "REJECTED",
        "RETURNED_FOR_CORRECTION",
        "CANCELLED",
      ] as const) {
        const p = await service.create(a, body({ status: s }));
        expect(p.items).toHaveLength(1);
        expect(p.items[0].status).toBe(s);
      }
      await expect(
        service.create(a, body({ status: "DRAFT" })),
      ).rejects.toMatchObject({ code: "INVALID_FILTER" });
    });
    it("immutable snapshot survives later master, status, pointer and return changes", async () => {
      const v = body(),
        p = await service.create(a, v),
        before = p.items.find((r) => r.requestId === current)!;
      await db.employee.update({
        where: { id: employee.employeeId },
        data: { fullName: "Nama M7 Sintetis Diubah" },
      });
      await db.leaveRequest.update({
        where: { id: current },
        data: { status: "REJECTED", currentRevisionNumber: 3 },
      });
      await returned(current, currentRevision, 1);
      const after = await service.read(a, p.run.id, new URLSearchParams());
      expect(after.items.find((r) => r.requestId === current)).toEqual(before);
      const pdf = await service.export(a, p.run.id, {
          format: "PDF",
          idempotencyKey: randomUUID(),
        }),
        xlsx = await service.export(a, p.run.id, {
          format: "XLSX",
          idempotencyKey: randomUUID(),
        });
      expect(pdf.datasetChecksum).toBe(xlsx.datasetChecksum);
      expect(pdf.datasetChecksum).toBe(p.run.datasetChecksum);
      const newer = await service.create(a, body());
      expect(newer.items.some((r) => r.requestId === current)).toBe(false);
    });
    it("Admin A/B, Pegawai, demotion/deactivation and artifact IDOR are server-enforced", async () => {
      const p = await service.create(a, body()),
        f = await service.export(a, p.run.id, {
          format: "XLSX",
          idempotencyKey: randomUUID(),
        });
      await expect(
        service.read(b, p.run.id, new URLSearchParams()),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.download(b, p.run.id, f.artifact.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.create(employee, body())).rejects.toMatchObject({
        status: 403,
      });
      await db.user.update({
        where: { id: a.userId },
        data: { role: "PEGAWAI" },
      });
      await expect(
        service.read(a, p.run.id, new URLSearchParams()),
      ).rejects.toMatchObject({ status: 403 });
      await db.user.update({
        where: { id: a.userId },
        data: { role: "ADMIN_KEPEGAWAIAN", isActive: false },
      });
      await expect(
        service.export(a, p.run.id, {
          format: "PDF",
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 403 });
      await db.user.update({
        where: { id: a.userId },
        data: { isActive: true },
      });
      await db.employee.update({
        where: { id: a.employeeId },
        data: { isActive: false },
      });
      await expect(
        service.download(a, p.run.id, f.artifact.id),
      ).rejects.toMatchObject({ status: 403 });
      await db.employee.update({
        where: { id: a.employeeId },
        data: { isActive: true },
      });
      const other = await service.create(a, body());
      await expect(
        service.download(a, other.run.id, f.artifact.id),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("concurrent identical requests serialize or return busy, then replay a single persisted run/artifact", async () => {
      const v = body();
      const results = await Promise.allSettled([
        service.create(a, v),
        service.create(a, v),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      for (const r of results)
        if (r.status === "rejected")
          expect(r.reason).toMatchObject({ status: 429 });
      const p = await service.create(a, v);
      expect(
        await db.reportRun.count({
          where: { actorUserId: a.userId, idempotencyKey: v.idempotencyKey },
        }),
      ).toBe(1);
      const key = randomUUID();
      await Promise.allSettled([
        service.export(a, p.run.id, { format: "PDF", idempotencyKey: key }),
        service.export(a, p.run.id, { format: "PDF", idempotencyKey: key }),
      ]);
      await service.export(a, p.run.id, { format: "PDF", idempotencyKey: key });
      expect(
        await db.reportArtifact.count({
          where: { runId: p.run.id, format: "PDF" },
        }),
      ).toBe(1);
    });
    it("redacts sensitive search in manifest/audit and SQL triggers reject metadata/audit rewriting", async () => {
      const v = body({ search: "NIP-PRIVATE-M7" }),
        p = await service.create(a, v);
      const r = await db.reportRun.findUniqueOrThrow({
        where: { id: p.run.id },
      });
      const e = await db.reportAuditEvent.findMany({
        where: { runId: p.run.id },
      });
      expect(JSON.stringify([r, e])).not.toContain("NIP-PRIVATE-M7");
      expect(JSON.stringify(r.filters)).toContain("searchDigest");
      await expect(
        db.reportRun.update({ where: { id: r.id }, data: { rowCount: 1 } }),
      ).rejects.toThrow();
      await expect(
        db.reportAuditEvent.update({
          where: { id: e[0].id },
          data: { resultCode: "REWRITTEN" },
        }),
      ).rejects.toThrow();
      await expect(
        db.reportAuditEvent.delete({ where: { id: e[0].id } }),
      ).rejects.toThrow();
    });
    it("real DB audit failure rolls back publication and removes unpublished bytes", async () => {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION m7_test_fail_ready() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."event"='RUN_READY' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        'CREATE TRIGGER m7_test_fail_ready BEFORE INSERT ON "ReportAuditEvent" FOR EACH ROW EXECUTE FUNCTION m7_test_fail_ready()',
      );
      const v = body();
      try {
        await expect(service.create(a, v)).rejects.toMatchObject({
          code: "AUDIT_UNAVAILABLE",
        });
        expect(
          await db.reportRun.count({
            where: { actorUserId: a.userId, idempotencyKey: v.idempotencyKey },
          }),
        ).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER m7_test_fail_ready ON "ReportAuditEvent"',
        );
        await db.$executeRawUnsafe("DROP FUNCTION m7_test_fail_ready()");
      }
    });
    it("expiry blocks all access at 24h and cleanup removes files with a controlled clock", async () => {
      const p = await service.create(a, body()),
        f = await service.export(a, p.run.id, {
          format: "XLSX",
          idempotencyKey: randomUUID(),
        }),
        previous = now;
      now = new Date(p.run.expiresAt);
      try {
        await expect(
          service.read(a, p.run.id, new URLSearchParams()),
        ).rejects.toMatchObject({ code: "REPORT_EXPIRED" });
        await expect(
          service.download(a, p.run.id, f.artifact.id),
        ).rejects.toMatchObject({ code: "REPORT_EXPIRED" });
        const dry = await purgeReportFiles(files, {
          now: new Date(now.getTime() + 24 * 3600000),
          dryRun: true,
        });
        expect(dry.eligible).toBeGreaterThan(0);
        const done = await purgeReportFiles(files, {
          now: new Date(now.getTime() + 24 * 3600000),
        });
        expect(done.failed).toBe(0);
        const r = await db.reportRun.findUniqueOrThrow({
          where: { id: p.run.id },
        });
        await expect(
          files.read(r.datasetKey, 5 * 1024 * 1024),
        ).rejects.toThrow();
      } finally {
        now = previous;
      }
    });
    it("privileged retention uses fixed 90 days, preserves recent events and is not executable by PUBLIC", async () => {
      const serverNow = (
        await db.$queryRaw<{ now: Date }[]>`SELECT statement_timestamp() AS now`
      )[0].now;
      const old = await db.reportAuditEvent.create({
          data: {
            id: randomUUID(),
            actorUserId: a.userId,
            actorRole: a.role,
            occurredAt: new Date(serverNow.getTime() - 91 * 86400000),
            correlationId: randomUUID(),
            definitionVersion: DEFINITION,
            event: "TEST_OLD",
            resultCode: "OK",
            filters: {},
          },
        }),
        recent = await db.reportAuditEvent.create({
          data: {
            id: randomUUID(),
            actorUserId: a.userId,
            actorRole: a.role,
            occurredAt: serverNow,
            correlationId: randomUUID(),
            definitionVersion: DEFINITION,
            event: "TEST_RECENT",
            resultCode: "OK",
            filters: {},
          },
        });
      const oldTime = new Date(serverNow.getTime() - 91 * 86400000),
        oldId = randomUUID(),
        oldArtifact = randomUUID();
      await db.reportRun.create({
        data: {
          id: oldId,
          actorUserId: a.userId,
          idempotencyKey: randomUUID(),
          payloadHash: "a".repeat(64),
          reportCode: "LEAVE_REQUESTS",
          definitionVersion: DEFINITION,
          rendererVersion: "m7-render-v1",
          filters: {},
          capturedAt: oldTime,
          createdAt: oldTime,
          expiresAt: new Date(oldTime.getTime() + 86400000),
          rowCount: 0,
          datasetKey: randomUUID().replaceAll("-", ""),
          datasetChecksum: "b".repeat(64),
          datasetSize: 10,
        },
      });
      await db.reportArtifact.create({
        data: {
          id: oldArtifact,
          runId: oldId,
          actorUserId: a.userId,
          idempotencyKey: randomUUID(),
          format: "PDF",
          rendererVersion: "m7-render-v1",
          storageKey: randomUUID().replaceAll("-", ""),
          checksum: "c".repeat(64),
          size: 10,
          createdAt: oldTime,
        },
      });
      await db.reportExportRequest.create({
        data: {
          id: randomUUID(),
          actorUserId: a.userId,
          idempotencyKey: randomUUID(),
          runId: oldId,
          format: "PDF",
          artifactId: oldArtifact,
        },
      });
      await db.$queryRaw`SELECT public.m7_purge_report_audit()`;
      expect(
        await db.reportRun.findUnique({ where: { id: oldId } }),
      ).toBeNull();
      expect(
        await db.reportArtifact.findUnique({ where: { id: oldArtifact } }),
      ).toBeNull();
      expect(
        await db.reportExportRequest.count({ where: { runId: oldId } }),
      ).toBe(0);
      expect(
        await db.reportAuditEvent.findUnique({ where: { id: old.id } }),
      ).toBeNull();
      expect(
        await db.reportAuditEvent.findUnique({ where: { id: recent.id } }),
      ).not.toBeNull();
      const acl = await db.$queryRaw<
        { publicExecute: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(p.proacl) a WHERE p.proname='m7_purge_report_audit' AND a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute"`;
      expect(acl[0].publicExecute).toBe(false);
    });
    it("preview/export/download do not mutate domain tables", async () => {
      const tables = [
        "AnnualBalanceAccount",
        "AnnualBalanceOperation",
        "LeaveRequest",
        "LeaveRequestRevision",
        "PermissionRequest",
        "PermissionRequestRevision",
        "JointLeaveClaim",
        "LeaveBalanceReturn",
        "LeaveDocument",
        "LeaveDecisionArchive",
        "WorkingCalendarException",
      ];
      async function hashes() {
        const out: unknown[] = [];
        for (const t of tables)
          out.push(
            await db.$queryRawUnsafe(
              `SELECT md5(COALESCE(jsonb_agg(v ORDER BY v->>'id')::text,'[]')) AS hash FROM (SELECT to_jsonb(t) AS v FROM "${t}" t) x`,
            ),
          );
        return out;
      }
      const before = await hashes(),
        p = await service.create(a, body()),
        f = await service.export(a, p.run.id, {
          format: "PDF",
          idempotencyKey: randomUUID(),
        });
      await service.download(a, p.run.id, f.artifact.id);
      expect(await hashes()).toEqual(before);
    });
    it("enforces actual PostgreSQL statement timeout under a competing table lock", async () => {
      await db.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'LOCK TABLE "LeaveRequest" IN ACCESS EXCLUSIVE MODE',
          );
          await expect(
            new PrismaReportReader(db, 100).read(
              reportFilters({ employeeId: employee.employeeId }),
            ),
          ).rejects.toMatchObject({ code: "QUERY_UNAVAILABLE" });
        },
        { timeout: 5000 },
      );
    });
    it("materializes bounded server pages and rejects 1001 rows without truncation", async () => {
      const owner = await actor("PEGAWAI"),
        ids = Array.from({ length: 1001 }, () => randomUUID());
      await db.leaveRequest.createMany({
        data: ids.map((id) => ({
          id,
          employeeId: owner.employeeId,
          status: "APPROVED" as const,
          currentRevisionNumber: 1,
        })),
      });
      await db.leaveRequestRevision.createMany({
        data: ids.map((id) => ({
          leaveRequestId: id,
          revisionNumber: 1,
          leaveType: "SICK" as const,
          startDate: new Date("2026-12-31"),
          endDate: new Date("2026-12-31"),
          reason: "PRIVATE",
          submittedAt: now,
        })),
      });
      await expect(
        service.create(a, body({ employeeId: owner.employeeId })),
      ).rejects.toMatchObject({ code: "REPORT_TOO_LARGE" });
      await db.leaveRequest.update({
        where: { id: ids.at(-1)! },
        data: { status: "DRAFT" },
      });
      const p = await service.create(a, body({ employeeId: owner.employeeId }));
      expect(p.run.rowCount).toBe(1000);
      expect(p.items).toHaveLength(25);
      const next = await service.read(
        a,
        p.run.id,
        new URLSearchParams({ cursor: p.nextCursor! }),
      );
      expect(next.offset).toBe(25);
      expect(next.items[0].requestId).not.toBe(p.items[0].requestId);
    });
  },
);
