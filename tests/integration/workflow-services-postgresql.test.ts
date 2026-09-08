import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  LeaveWorkflowService,
  PermissionWorkflowService,
  type WorkflowRepository,
  type WorkflowTransaction,
} from "@/application/workflow";
import type { Principal } from "@/modules/auth/service";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaWorkflowRepository } from "@/infrastructure/workflow/prisma-workflow-repository";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const key = (label: string) => `${label}-${randomUUID()}`;

run("M4 workflow services on PostgreSQL", () => {
  const database = createDatabaseClient();
  const repository = new PrismaWorkflowRepository(database);
  const leave = new LeaveWorkflowService(repository);
  const permission = new PermissionWorkflowService(repository);
  const employees: string[] = [];
  const permissionTypes: string[] = [];

  function withTransaction(
    wrap: (transaction: WorkflowTransaction) => WorkflowTransaction,
  ): WorkflowRepository {
    return new Proxy(repository, {
      get(target, property) {
        if (property === "transaction") {
          return <T>(work: (transaction: WorkflowTransaction) => Promise<T>) =>
            target.transaction((transaction) => work(wrap(transaction)));
        }
        const value = target[property as keyof typeof target];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  async function actor(role: Principal["role"] = "PEGAWAI") {
    const employee = await database.employee.create({
      data: {
        nip: `WF-${randomUUID().replaceAll("-", "").slice(0, 28)}`,
        fullName: "Pegawai Integrasi Workflow",
        positionTitle: "Penguji",
        workUnit: "Unit Pengujian",
      },
    });
    employees.push(employee.id);
    const user = await database.user.create({
      data: { employeeId: employee.id, role },
    });
    return {
      userId: user.id,
      employeeId: employee.id,
      fullName: employee.fullName,
      role,
    } satisfies Principal;
  }

  async function type(active = true) {
    const value = await database.permissionType.create({
      data: { code: key("TYPE"), name: "Izin Integrasi", isActive: active },
    });
    permissionTypes.push(value.id);
    return value.id;
  }

  async function balances(employeeId: string, days = 12) {
    await database.annualBalanceAccount.createMany({
      data: [
        {
          employeeId,
          entitlementYear: 2099,
          bucket: "JOINT_LEAVE_CLAIM",
          grantedDays: 0,
        },
        { employeeId, entitlementYear: 2099, bucket: "N2", grantedDays: 0 },
        { employeeId, entitlementYear: 2099, bucket: "N1", grantedDays: 0 },
        { employeeId, entitlementYear: 2099, bucket: "N", grantedDays: days },
      ],
    });
  }

  const leaveContent = {
    leaveType: "SICK" as const,
    startDate: "2099-01-12",
    endDate: "2099-01-13",
    reason: "Keperluan integrasi workflow",
  };
  const annualContent = { ...leaveContent, leaveType: "ANNUAL" as const };
  const permissionContent = (permissionTypeId: string) => ({
    permissionTypeId,
    startDate: "2099-02-09",
    endDate: "2099-02-10",
    reason: "Keperluan integrasi izin",
  });

  afterEach(async () => {
    await database.annualBalanceOperation.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.leaveRequestTransition.deleteMany({
      where: { leaveRequest: { employeeId: { in: employees } } },
    });
    await database.permissionRequestTransition.deleteMany({
      where: { permissionRequest: { employeeId: { in: employees } } },
    });
    await database.leaveRequestRevision.deleteMany({
      where: { leaveRequest: { employeeId: { in: employees } } },
    });
    await database.permissionRequestRevision.deleteMany({
      where: { permissionRequest: { employeeId: { in: employees } } },
    });
    await database.leaveRequest.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.permissionRequest.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.annualBalanceAccount.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.user.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.employee.deleteMany({ where: { id: { in: employees } } });
    await database.permissionType.deleteMany({
      where: { id: { in: permissionTypes } },
    });
    employees.length = 0;
    permissionTypes.length = 0;
  });
  afterAll(() => database.$disconnect());

  it("enforces owner authorization and submitted immutability for both workflows", async () => {
    const owner = await actor();
    const outsider = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    const leaveDraft = await leave.createDraft(owner, leaveContent);
    const permissionDraft = await permission.createDraft(
      owner,
      permissionContent(await type()),
    );
    for (const attempt of [
      () => leave.get(outsider, leaveDraft.id),
      () => leave.updateDraft(outsider, leaveDraft.id, leaveContent),
      () => leave.submit(outsider, leaveDraft.id, key("foreign-leave")),
      () => permission.get(outsider, permissionDraft.id),
      () =>
        permission.updateDraft(
          outsider,
          permissionDraft.id,
          permissionContent(permissionDraft.currentRevision.permissionTypeId),
        ),
      () =>
        permission.submit(
          outsider,
          permissionDraft.id,
          key("foreign-permission"),
        ),
    ])
      await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await leave.submit(owner, leaveDraft.id, key("submit-leave"));
    await permission.submit(
      owner,
      permissionDraft.id,
      key("submit-permission"),
    );
    await expect(
      leave.updateDraft(admin, leaveDraft.id, leaveContent),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      permission.updateDraft(
        admin,
        permissionDraft.id,
        permissionContent(permissionDraft.currentRevision.permissionTypeId),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await leave.revisions(owner, leaveDraft.id))[0].reason).toBe(
      leaveContent.reason,
    );
    expect(
      (await permission.revisions(owner, permissionDraft.id))[0].reason,
    ).toBe(
      permissionContent(permissionDraft.currentRevision.permissionTypeId)
        .reason,
    );
  });

  it("persists exact audit pairs for every legal leave transition", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    const histories: Array<[string, string]> = [];
    const draftCancel = await leave.createDraft(owner, leaveContent);
    const cancelledDraft = await leave.cancel(
      owner,
      draftCancel.id,
      key("cancel-draft"),
    );
    histories.push([cancelledDraft.fromStatus, cancelledDraft.toStatus]);
    for (const target of [
      "RETURNED_FOR_CORRECTION",
      "REJECTED",
      "APPROVED",
      "CANCELLED",
    ] as const) {
      const request = await leave.createDraft(owner, leaveContent);
      const submitted = await leave.submit(owner, request.id, key("submit"));
      histories.push([submitted.fromStatus, submitted.toStatus]);
      if (target === "RETURNED_FOR_CORRECTION") {
        const returned = await leave.returnForCorrection(
          admin,
          request.id,
          "Perbaiki data",
          key("return"),
        );
        histories.push([returned.fromStatus, returned.toStatus]);
        const cancelled = await leave.cancel(
          owner,
          request.id,
          key("cancel-returned"),
        );
        histories.push([cancelled.fromStatus, cancelled.toStatus]);
      } else if (target === "REJECTED") {
        const x = await leave.reject(
          admin,
          request.id,
          "Tidak disetujui",
          key("reject"),
        );
        histories.push([x.fromStatus, x.toStatus]);
      } else if (target === "APPROVED") {
        const x = await leave.approve(
          admin,
          request.id,
          "BUKTI-1",
          key("approve"),
        );
        histories.push([x.fromStatus, x.toStatus]);
      } else {
        const x = await leave.cancel(
          owner,
          request.id,
          key("cancel-submitted"),
        );
        histories.push([x.fromStatus, x.toStatus]);
      }
    }
    expect(histories).toEqual([
      ["DRAFT", "CANCELLED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "RETURNED_FOR_CORRECTION"],
      ["RETURNED_FOR_CORRECTION", "CANCELLED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "REJECTED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "APPROVED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "CANCELLED"],
    ]);
  });

  it("persists exact audit pairs for permission correction, resubmit, and all terminal decisions", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    const permissionTypeId = await type();
    const returned = await permission.createDraft(
      owner,
      permissionContent(permissionTypeId),
    );
    const pairs: Array<[string, string]> = [];
    for (const x of [
      await permission.submit(owner, returned.id, key("ps")),
      await permission.returnForCorrection(
        admin,
        returned.id,
        "Perbaiki",
        key("pr"),
      ),
      await permission.submit(owner, returned.id, key("prs")),
    ])
      pairs.push([x.fromStatus, x.toStatus]);
    const revised = await permission.revisions(owner, returned.id);
    expect(
      revised.map((r) => [r.revisionNumber, Boolean(r.submittedAt)]),
    ).toEqual([
      [1, true],
      [2, true],
    ]);
    for (const target of ["APPROVED", "REJECTED", "CANCELLED"] as const) {
      const request = await permission.createDraft(
        owner,
        permissionContent(permissionTypeId),
      );
      const submitted = await permission.submit(owner, request.id, key("ps2"));
      pairs.push([submitted.fromStatus, submitted.toStatus]);
      const result =
        target === "APPROVED"
          ? await permission.approve(admin, request.id, "BUKTI", key("pa"))
          : target === "REJECTED"
            ? await permission.reject(admin, request.id, "Ditolak", key("px"))
            : await permission.cancel(owner, request.id, key("pc"));
      pairs.push([result.fromStatus, result.toStatus]);
      await expect(
        permission.submit(owner, request.id, key("terminal")),
      ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    }
    expect(pairs).toEqual([
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "RETURNED_FOR_CORRECTION"],
      ["RETURNED_FOR_CORRECTION", "SUBMITTED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "APPROVED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "REJECTED"],
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "CANCELLED"],
    ]);
  });

  it("preserves historical permission revisions and blocks inactive types at editable boundaries", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    const permissionTypeId = await type();
    const request = await permission.createDraft(
      owner,
      permissionContent(permissionTypeId),
    );
    await permission.submit(owner, request.id, key("submit"));
    await database.permissionType.update({
      where: { id: permissionTypeId },
      data: { isActive: false },
    });
    expect((await permission.revisions(owner, request.id))[0]).toMatchObject({
      permissionTypeId,
      submittedAt: expect.any(Date),
    });
    await expect(
      permission.returnForCorrection(
        admin,
        request.id,
        "Perbaiki",
        key("return"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      permission.createDraft(owner, permissionContent(permissionTypeId)),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps permission workflow isolated from annual balance operations", async () => {
    const owner = await actor();
    const request = await permission.createDraft(
      owner,
      permissionContent(await type()),
    );
    await permission.submit(owner, request.id, key("submit"));
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: owner.employeeId },
      }),
    ).toBe(0);
  });

  it("reserves, releases on return, reserves the new revision, and commits exact annual references", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    await balances(owner.employeeId);
    const request = await leave.createDraft(owner, annualContent);
    const firstRevision = request.currentRevision.id;
    await leave.submit(owner, request.id, key("submit"));
    expect(
      (await leave.get(owner, request.id)).currentRevision
        .calculatedWorkingDays,
    ).toBe(2);
    await leave.returnForCorrection(
      admin,
      request.id,
      "Perbaiki",
      key("return"),
    );
    const corrected = await leave.get(owner, request.id);
    expect(corrected.currentRevision.id).not.toBe(firstRevision);
    await leave.updateDraft(owner, request.id, {
      ...annualContent,
      endDate: "2099-01-14",
    });
    await leave.submit(owner, request.id, key("resubmit"));
    await leave.approve(admin, request.id, "BUKTI", key("approve"));
    const ops = await database.annualBalanceOperation.findMany({
      where: { employeeId: owner.employeeId },
      orderBy: { createdAt: "asc" },
    });
    expect(ops.map((o) => o.operationType)).toEqual([
      "RESERVE",
      "RELEASE",
      "RESERVE",
      "COMMIT",
    ]);
    expect(ops.every((o) => o.referenceType === "LEAVE_REQUEST_REVISION")).toBe(
      true,
    );
    expect(ops.map((o) => o.referenceId)).toEqual([
      firstRevision,
      firstRevision,
      corrected.currentRevision.id,
      corrected.currentRevision.id,
    ]);
  });

  it.each(["REJECTED", "CANCELLED"] as const)(
    "releases a submitted annual reservation when %s",
    async (target) => {
      const owner = await actor();
      const admin = await actor("ADMIN_KEPEGAWAIAN");
      await balances(owner.employeeId);
      const request = await leave.createDraft(owner, annualContent);
      await leave.submit(owner, request.id, key("submit"));
      if (target === "REJECTED")
        await leave.reject(admin, request.id, "Ditolak", key("decision"));
      else await leave.cancel(owner, request.id, key("decision"));
      expect(
        (
          await database.annualBalanceOperation.findMany({
            where: { employeeId: owner.employeeId },
          })
        )
          .map((o) => o.operationType)
          .sort(),
      ).toEqual(["RELEASE", "RESERVE"]);
    },
  );

  it("rolls back state, revision, transition, and balances after insufficient balance", async () => {
    const owner = await actor();
    await balances(owner.employeeId, 1);
    const request = await leave.createDraft(owner, annualContent);
    await expect(
      leave.submit(owner, request.id, key("submit")),
    ).rejects.toThrow();
    expect(await leave.get(owner, request.id)).toMatchObject({
      status: "DRAFT",
      currentRevision: { submittedAt: null },
    });
    expect(
      await database.leaveRequestTransition.count({
        where: { leaveRequestId: request.id },
      }),
    ).toBe(0);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: owner.employeeId },
      }),
    ).toBe(0);
  });

  it("rolls back real balance mutations when workflow persistence fails", async () => {
    const owner = await actor();
    await balances(owner.employeeId);
    const request = await leave.createDraft(owner, annualContent);
    const failing = withTransaction(
      (tx) =>
        new Proxy(tx, {
          get(target, property) {
            if (property === "appendLeaveTransition")
              return async () => {
                throw new Error("forced workflow failure");
              };
            const value = target[property as keyof WorkflowTransaction];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as WorkflowTransaction,
    );
    await expect(
      new LeaveWorkflowService(failing).submit(
        owner,
        request.id,
        key("submit"),
      ),
    ).rejects.toThrow("forced workflow failure");
    expect((await leave.get(owner, request.id)).status).toBe("DRAFT");
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: owner.employeeId },
      }),
    ).toBe(0);
  });

  it("rolls back workflow changes when a real transaction-scoped balance mutation fails", async () => {
    const owner = await actor();
    await balances(owner.employeeId);
    const request = await leave.createDraft(owner, annualContent);
    const failing = withTransaction(
      (tx) =>
        new Proxy(tx, {
          get(target, property) {
            if (property === "annualBalanceRepository")
              return new Proxy(target.annualBalanceRepository, {
                get(balance, method) {
                  if (method === "withLockedAccounts")
                    return async () => {
                      throw new Error("forced balance failure");
                    };
                  const value = balance[method as keyof typeof balance];
                  return typeof value === "function"
                    ? value.bind(balance)
                    : value;
                },
              });
            const value = target[property as keyof WorkflowTransaction];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as WorkflowTransaction,
    );
    await expect(
      new LeaveWorkflowService(failing).submit(
        owner,
        request.id,
        key("submit"),
      ),
    ).rejects.toThrow("forced balance failure");
    expect((await leave.get(owner, request.id)).status).toBe("DRAFT");
    expect(
      await database.leaveRequestTransition.count({
        where: { leaveRequestId: request.id },
      }),
    ).toBe(0);
  });

  it("serializes conflicting decisions through the parent lock", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    await balances(owner.employeeId);
    const request = await leave.createDraft(owner, annualContent);
    await leave.submit(owner, request.id, key("submit"));
    const results = await Promise.allSettled([
      leave.approve(admin, request.id, "BUKTI", key("approve")),
      leave.reject(admin, request.id, "Ditolak", key("reject")),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const operations = await database.annualBalanceOperation.findMany({
      where: { employeeId: owner.employeeId },
    });
    expect(
      operations.filter((o) => ["COMMIT", "RELEASE"].includes(o.operationType)),
    ).toHaveLength(1);
  });

  it("makes logical retries idempotent and rejects conflicting key reuse", async () => {
    const owner = await actor();
    const admin = await actor("ADMIN_KEPEGAWAIAN");
    await balances(owner.employeeId);
    const request = await leave.createDraft(owner, annualContent);
    const idempotencyKey = key("submit");
    const first = await leave.submit(owner, request.id, idempotencyKey);
    const retry = await leave.submit(owner, request.id, idempotencyKey);
    expect(retry.id).toBe(first.id);
    expect(
      await database.leaveRequestTransition.count({
        where: { leaveRequestId: request.id },
      }),
    ).toBe(1);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: owner.employeeId },
      }),
    ).toBe(1);
    const returnKey = key("return");
    const returned = await leave.returnForCorrection(
      admin,
      request.id,
      "Perbaiki data",
      returnKey,
    );
    expect(
      (
        await leave.returnForCorrection(
          admin,
          request.id,
          "Perbaiki data",
          returnKey,
        )
      ).id,
    ).toBe(returned.id);
    expect(
      await database.leaveRequestTransition.count({
        where: { leaveRequestId: request.id },
      }),
    ).toBe(2);
    expect(await leave.revisions(owner, request.id)).toHaveLength(2);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: owner.employeeId },
      }),
    ).toBe(2);
    await expect(
      leave.cancel(owner, request.id, idempotencyKey),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("supports same-year annual leave and rejects cross-year policy atomically", async () => {
    const owner = await actor();
    await balances(owner.employeeId);
    const same = await leave.createDraft(owner, annualContent);
    await expect(
      leave.submit(owner, same.id, key("same")),
    ).resolves.toMatchObject({ fromStatus: "DRAFT", toStatus: "SUBMITTED" });
    const cross = await leave.createDraft(owner, {
      ...annualContent,
      startDate: "2099-12-31",
      endDate: "2100-01-01",
    });
    await expect(
      leave.submit(owner, cross.id, key("cross")),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_POLICY" });
    expect((await leave.get(owner, cross.id)).status).toBe("DRAFT");
  });
});
