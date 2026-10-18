import { randomUUID, createHash, randomBytes } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaEmployeeRepository } from "@/infrastructure/employees/prisma-employee-repository";
import { PrismaAccountAdministrationRepository } from "@/infrastructure/accounts/prisma-account-administration-repository";
import { EmployeeService } from "@/application/employees/service";
import {
  EmployeeImportService,
  EMPLOYEE_IMPORT_HEADERS,
} from "@/application/employees/import-service";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import { templateWorkbook } from "@/infrastructure/spreadsheet/workbook";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
if (process.env.DATABASE_URL && process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1")
  describe("Employee administration durable audit and retry", () => {
    const db = createDatabaseClient(),
      repo = new PrismaEmployeeRepository(db),
      service = new EmployeeService(repo),
      accounts = new PrismaAccountAdministrationRepository(db),
      auth = new AuthenticationService(new PrismaAuthRepository(db));
    const actorId = randomUUID();
    let ready = false;
    async function actor() {
      if (!ready) {
        const e = await db.employee.create({
          data: {
            nip: `AUD-${actorId}`.slice(0, 32),
            fullName: "Admin Sintetis",
            positionTitle: "Penguji",
            workUnit: "Unit Uji",
          },
        });
        await db.user.create({
          data: { id: actorId, employeeId: e.id, role: "ADMIN_KEPEGAWAIAN" },
        });
        ready = true;
      }
      return { actorUserId: actorId };
    }
    const input = (nip = `E-${randomUUID()}`) => ({
      nip: nip.slice(0, 32),
      fullName: "Pegawai Sintetis",
      positionTitle: "Penguji",
      workUnit: "Unit Uji",
      directSupervisorId: null,
    });
    async function session(employeeId: string) {
      let user = await db.user.findUnique({ where: { employeeId } });
      user ??= await db.user.create({ data: { employeeId, role: "PEGAWAI" } });
      let identity = await db.authenticationIdentity.findFirst({
        where: { userId: user.id, provider: "LOCAL" },
      });
      identity ??= await db.authenticationIdentity.create({
        data: {
          userId: user.id,
          provider: "LOCAL",
          providerSubject: `S-${randomUUID()}`,
        },
      });
      const token = randomBytes(32).toString("hex");
      await db.session.create({
        data: {
          authenticationIdentityId: identity.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return token;
    }
    afterAll(async () => {
      await db.$disconnect();
    }); // Append-only audit + referenced fixtures deliberately remain in disposable DB.
    it("commits actor/time/field names with master writes, without full PII payloads", async () => {
      const mutation = await actor(),
        before = Date.now();
      const employee = await service.create(input(), mutation);
      await service.update(
        employee.id,
        { ...employee, fullName: "Nama Baru Sintetis" },
        {
          ...mutation,
          expectedUpdatedAt: employee.updatedAt!.toString().includes("GMT")
            ? (employee.updatedAt as Date).toISOString()
            : String(employee.updatedAt),
        },
      );
      const events = await db.employeeAdministrationEvent.findMany({
        where: { targetEmployeeId: employee.id },
        orderBy: { createdAt: "asc" },
      });
      expect(events.map((e) => e.action)).toEqual([
        "EMPLOYEE_CREATE",
        "EMPLOYEE_UPDATE",
      ]);
      expect(
        events.every(
          (e) =>
            e.actorUserId === actorId && e.createdAt.getTime() >= before - 1000,
        ),
      ).toBe(true);
      expect(JSON.stringify(events)).not.toContain(employee.nip);
      expect(JSON.stringify(events)).not.toContain("Nama Baru Sintetis");
    });
    it("rolls back employee creation if persistent audit fails", async () => {
      const value = input();
      await expect(
        service.create(value, { actorUserId: randomUUID() }),
      ).rejects.toBeTruthy();
      expect(
        await db.employee.findUnique({ where: { nip: value.nip } }),
      ).toBeNull();
    });
    it("uses CAS under the shared lifecycle lock: concurrent edit has one winner", async () => {
      const mutation = await actor(),
        e = await service.create(input(), mutation),
        version = (e.updatedAt as Date).toISOString();
      const results = await Promise.allSettled([
        service.update(
          e.id,
          { ...e, fullName: "Satu" },
          { ...mutation, expectedUpdatedAt: version },
        ),
        service.update(
          e.id,
          { ...e, fullName: "Dua" },
          { ...mutation, expectedUpdatedAt: version },
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const fail = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(fail.reason.code).toBe("CONFLICT");
      expect(
        await db.employeeAdministrationEvent.count({
          where: { targetEmployeeId: e.id, action: "EMPLOYEE_UPDATE" },
        }),
      ).toBe(1);
    });
    it("deactivation revokes old sessions permanently; reactivation preserves disabled account", async () => {
      const mutation = await actor(),
        e = await service.create(input(), mutation),
        token = await session(e.id);
      expect(await auth.validate(token)).not.toBeNull();
      await service.setActive(e.id, false, mutation);
      expect(await auth.validate(token)).toBeNull();
      await service.setActive(e.id, true, mutation);
      expect(await auth.validate(token)).toBeNull();
      const token2 = await session(e.id);
      await accounts.updateActive(e.id, false, mutation);
      await service.setActive(e.id, false, mutation);
      await service.setActive(e.id, true, mutation);
      expect((await accounts.findByEmployeeId(e.id))?.isActive).toBe(false);
      await accounts.updateActive(e.id, true, mutation);
      expect(await auth.validate(token2)).toBeNull();
      expect(await db.employee.count({ where: { id: e.id } })).toBe(1);
      expect(await db.user.count({ where: { employeeId: e.id } })).toBe(1);
    });
    it("audits provision, role, account status and reset without credential content", async () => {
      const mutation = await actor(),
        e = await service.create(input(), mutation);
      await accounts.provision(
        e.id,
        "PEGAWAI",
        "synthetic-not-login-hash",
        mutation,
      );
      await accounts.updateRole(e.id, "PEGAWAI", mutation);
      await accounts.updateActive(e.id, false, mutation);
      await accounts.updateActive(e.id, true, mutation);
      await accounts.resetLocalPassword(
        e.id,
        "replacement-synthetic-hash",
        new Date(),
        mutation,
      );
      const events = await db.employeeAdministrationEvent.findMany({
        where: { targetEmployeeId: e.id },
      });
      expect(events.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          "ACCOUNT_PROVISION",
          "ACCOUNT_ROLE",
          "ACCOUNT_DEACTIVATE",
          "ACCOUNT_ACTIVATE",
          "ACCOUNT_PASSWORD_RESET",
        ]),
      );
      expect(JSON.stringify(events)).not.toMatch(
        /synthetic.*hash|replacement-synthetic/,
      );
    });
    it("preview is read-only; valid template rows commit exactly once across concurrent retries", async () => {
      const mutation = {
          ...(await actor()),
          idempotencyKey: randomUUID(),
          requestHash: "a".repeat(64),
        },
        nip = `0000${randomUUID().replaceAll("-", "").slice(0, 24)}`;
      const bytes = templateWorkbook(
          [
            [...EMPLOYEE_IMPORT_HEADERS],
            [nip, "Sintetis", "Penguji", "Unit Uji", "AKTIF"],
          ],
          "Pegawai",
        ),
        imp = new EmployeeImportService(
          new XlsxWorkbookReader(true, true),
          repo,
        );
      expect((await imp.preview(bytes)).validRows).toBe(1);
      expect(await db.employee.count({ where: { nip } })).toBe(0);
      const results = await Promise.all([
        imp.commit(bytes, mutation),
        imp.commit(bytes, mutation),
      ]);
      expect(results[0][0].id).toBe(results[1][0].id);
      expect(await db.employee.count({ where: { nip } })).toBe(1);
      expect((await imp.commit(bytes, mutation))[0].nip).toBe(nip);
      expect(
        await db.employeeAdministrationEvent.count({
          where: {
            actorUserId: actorId,
            idempotencyKey: mutation.idempotencyKey,
          },
        }),
      ).toBe(1);
      expect(
        await db.user.count({ where: { employeeId: results[0][0].id } }),
      ).toBe(0);
      expect(
        await db.annualBalanceAccount.count({
          where: { employeeId: results[0][0].id },
        }),
      ).toBe(0);
    });
    it("rejects reuse of import key for other bytes, existing NIP and partial commit", async () => {
      const mutation = {
          ...(await actor()),
          idempotencyKey: randomUUID(),
          requestHash: "b".repeat(64),
        },
        nip = `I-${randomUUID()}`.slice(0, 32),
        fresh = `F-${randomUUID()}`.slice(0, 32),
        imp = new EmployeeImportService(
          new XlsxWorkbookReader(true, true),
          repo,
        );
      const bytes = templateWorkbook([
        [...EMPLOYEE_IMPORT_HEADERS],
        [nip, "Asli", "Uji", "Unit", "FALSE"],
      ]);
      await imp.commit(bytes, mutation);
      await expect(
        imp.commit(bytes, { ...mutation, requestHash: "c".repeat(64) }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const duplicate = templateWorkbook([
        [...EMPLOYEE_IMPORT_HEADERS],
        [nip, "Timpa", "Uji", "Unit", "TRUE"],
        [fresh, "Baru", "Uji", "Unit", "TRUE"],
      ]);
      await expect(
        imp.commit(duplicate, { ...mutation, idempotencyKey: randomUUID() }),
      ).rejects.toThrow("dibatalkan");
      expect(await db.employee.findUnique({ where: { nip } })).toMatchObject({
        fullName: "Asli",
        isActive: false,
      });
      expect(
        await db.employee.findUnique({ where: { nip: fresh } }),
      ).toBeNull();
    });
    it("different import keys racing on one NIP cannot duplicate or partially write", async () => {
      const mutation = await actor(),
        nip = `R-${randomUUID()}`.slice(0, 32),
        bytes = templateWorkbook([
          [...EMPLOYEE_IMPORT_HEADERS],
          [nip, "Race", "Uji", "Unit", "TRUE"],
        ]),
        imp = new EmployeeImportService(
          new XlsxWorkbookReader(true, true),
          repo,
        );
      const result = await Promise.allSettled([
        imp.commit(bytes, {
          ...mutation,
          idempotencyKey: randomUUID(),
          requestHash: "d".repeat(64),
        }),
        imp.commit(bytes, {
          ...mutation,
          idempotencyKey: randomUUID(),
          requestHash: "d".repeat(64),
        }),
      ]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.employee.count({ where: { nip } })).toBe(1);
    });
    it("master edit/deactivation preserves immutable document/supervisor snapshot and balances", async () => {
      const mutation = await actor(),
        e = await service.create(input(), mutation);
      const balance = await db.annualBalanceAccount.create({
        data: {
          employeeId: e.id,
          entitlementYear: 2026,
          bucket: "N",
          grantedDays: 12,
          reservedDays: 1,
          committedDays: 2,
        },
      });
      const request = await db.leaveRequest.create({
        data: { employeeId: e.id },
      });
      const revision = await db.leaveRequestRevision.create({
        data: {
          leaveRequestId: request.id,
          revisionNumber: 1,
          leaveType: "ANNUAL",
          startDate: new Date("2026-10-19"),
          endDate: new Date("2026-10-20"),
          reason: "Sintetis",
          directSupervisorSnapshotCaptured: true,
          directSupervisorIdSnapshot: randomUUID(),
          directSupervisorNipSnapshot: "ATASAN-SINTETIS",
          directSupervisorTitleSnapshot: "Atasan Uji",
          directSupervisorNameSnapshot: "Atasan Lama Sintetis",
        },
      });
      const snapshot = {
        employeeName: e.fullName,
        nip: e.nip,
        supervisor: "Atasan Lama Sintetis",
      };
      const document = await db.leaveDocument.create({
        data: {
          leaveRequestId: request.id,
          revisionId: revision.id,
          documentType: "SUBMISSION_PROOF",
          storageKey: `synthetic-${randomUUID()}`,
          checksumSha256: "a".repeat(64),
          sizeBytes: 10,
          snapshot,
        },
      });
      await service.update(
        e.id,
        { ...e, fullName: "Nama Master Baru", directSupervisorId: null },
        mutation,
      );
      await service.setActive(e.id, false, mutation);
      await service.setActive(e.id, true, mutation);
      expect(
        (await db.leaveDocument.findUnique({ where: { id: document.id } }))
          ?.snapshot,
      ).toEqual(snapshot);
      expect(
        (
          await db.leaveRequestRevision.findUnique({
            where: { id: revision.id },
          })
        )?.directSupervisorNameSnapshot,
      ).toBe("Atasan Lama Sintetis");
      expect(await db.leaveRequest.count({ where: { id: request.id } })).toBe(
        1,
      );
      expect(
        await db.annualBalanceAccount.findUnique({ where: { id: balance.id } }),
      ).toEqual(balance);
    });
    it("rolls back the complete import when its audit insert fails", async () => {
      const a = `RB-${randomUUID()}`.slice(0, 32),
        b = `RC-${randomUUID()}`.slice(0, 32);
      const bytes = templateWorkbook([
        [...EMPLOYEE_IMPORT_HEADERS],
        [a, "A", "Uji", "Unit", "TRUE"],
        [b, "B", "Uji", "Unit", "TRUE"],
      ]);
      const imp = new EmployeeImportService(
        new XlsxWorkbookReader(true, true),
        repo,
      );
      await expect(
        imp.commit(bytes, {
          actorUserId: randomUUID(),
          idempotencyKey: randomUUID(),
          requestHash: "e".repeat(64),
        }),
      ).rejects.toBeTruthy();
      expect(await db.employee.count({ where: { nip: { in: [a, b] } } })).toBe(
        0,
      );
    });
    it("audit is immutable including truncate, without applying M7 retention", async () => {
      await actor();
      await expect(
        db.$executeRawUnsafe(
          'UPDATE "EmployeeAdministrationEvent" SET action=action',
        ),
      ).rejects.toThrow("append-only");
      await expect(
        db.$executeRawUnsafe('DELETE FROM "EmployeeAdministrationEvent"'),
      ).rejects.toThrow("append-only");
      await expect(
        db.$executeRawUnsafe('TRUNCATE "EmployeeAdministrationEvent"'),
      ).rejects.toThrow("append-only");
    });
  });
else
  describe.skip("Employee administration audit requires disposable DB flag", () => {
    it("not run", () => {});
  });
