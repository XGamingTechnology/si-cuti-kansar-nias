import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("M4 Batch 1 workflow persistence", () => {
  const database = createDatabaseClient();
  const employeeIds: string[] = [];
  const permissionTypeIds: string[] = [];

  async function createEmployeeWithUser() {
    const employee = await database.employee.create({
      data: {
        nip: `M4-${randomUUID().replaceAll("-", "").slice(0, 29)}`,
        fullName: "Pegawai Uji M4",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      },
    });
    employeeIds.push(employee.id);
    const user = await database.user.create({
      data: { employeeId: employee.id, role: "PEGAWAI" },
    });
    return { employee, user };
  }

  async function createLeaveRevision(overrides = {}) {
    const { employee, user } = await createEmployeeWithUser();
    const request = await database.leaveRequest.create({
      data: { employeeId: employee.id },
    });
    const revision = await database.leaveRequestRevision.create({
      data: {
        leaveRequestId: request.id,
        revisionNumber: 1,
        leaveType: "ANNUAL",
        startDate: new Date("2099-01-10T00:00:00.000Z"),
        endDate: new Date("2099-01-11T00:00:00.000Z"),
        reason: "Keperluan pengujian",
        calculatedWorkingDays: 2,
        ...overrides,
      },
    });
    return { request, revision, user };
  }

  async function createPermissionRevision(overrides = {}) {
    const { employee, user } = await createEmployeeWithUser();
    const permissionType = await database.permissionType.create({
      data: {
        code: `TEST-${randomUUID()}`,
        name: "Jenis Izin Uji",
      },
    });
    permissionTypeIds.push(permissionType.id);
    const request = await database.permissionRequest.create({
      data: { employeeId: employee.id },
    });
    const revision = await database.permissionRequestRevision.create({
      data: {
        permissionRequestId: request.id,
        revisionNumber: 1,
        permissionTypeId: permissionType.id,
        startDate: new Date("2099-02-10T00:00:00.000Z"),
        endDate: new Date("2099-02-11T00:00:00.000Z"),
        reason: "Keperluan pengujian",
        ...overrides,
      },
    });
    return { permissionType, request, revision, user };
  }

  afterEach(async () => {
    await database.leaveRequestTransition.deleteMany({
      where: { leaveRequest: { employeeId: { in: employeeIds } } },
    });
    await database.permissionRequestTransition.deleteMany({
      where: { permissionRequest: { employeeId: { in: employeeIds } } },
    });
    await database.leaveRequestRevision.deleteMany({
      where: { leaveRequest: { employeeId: { in: employeeIds } } },
    });
    await database.permissionRequestRevision.deleteMany({
      where: { permissionRequest: { employeeId: { in: employeeIds } } },
    });
    await database.leaveRequest.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.permissionRequest.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.user.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await database.permissionType.deleteMany({
      where: { id: { in: permissionTypeIds } },
    });
    employeeIds.length = 0;
    permissionTypeIds.length = 0;
  });

  afterAll(() => database.$disconnect());

  it("rejects duplicate leave revision numbers within one request", async () => {
    const { revision } = await createLeaveRevision();
    await expect(
      database.leaveRequestRevision.create({
        data: {
          leaveRequestId: revision.leaveRequestId,
          revisionNumber: revision.revisionNumber,
          leaveType: "SICK",
          startDate: revision.startDate,
          endDate: revision.endDate,
          reason: "Duplikat",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate permission revision numbers within one request", async () => {
    const { revision } = await createPermissionRevision();
    await expect(
      database.permissionRequestRevision.create({
        data: {
          permissionRequestId: revision.permissionRequestId,
          revisionNumber: revision.revisionNumber,
          permissionTypeId: revision.permissionTypeId,
          startDate: revision.startDate,
          endDate: revision.endDate,
          reason: "Duplikat",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects revision numbers below one for both workflows", async () => {
    await expect(createLeaveRevision({ revisionNumber: 0 })).rejects.toThrow();
    await expect(createPermissionRevision({ revisionNumber: 0 })).rejects.toThrow();
  });

  it("rejects reversed date ranges for both workflows", async () => {
    const reversed = {
      startDate: new Date("2099-03-11T00:00:00.000Z"),
      endDate: new Date("2099-03-10T00:00:00.000Z"),
    };
    await expect(createLeaveRevision(reversed)).rejects.toThrow();
    await expect(createPermissionRevision(reversed)).rejects.toThrow();
  });

  it.each([0, -1])(
    "rejects calculatedWorkingDays=%i when it is non-null",
    async (calculatedWorkingDays) => {
      await expect(createLeaveRevision({ calculatedWorkingDays })).rejects.toThrow();
    },
  );

  it("rejects duplicate PermissionType codes", async () => {
    const code = `TEST-${randomUUID()}`;
    const first = await database.permissionType.create({
      data: { code, name: "Pertama" },
    });
    permissionTypeIds.push(first.id);
    await expect(
      database.permissionType.create({ data: { code, name: "Kedua" } }),
    ).rejects.toThrow();
  });

  it("rejects duplicate leave transition idempotency keys", async () => {
    const { request, revision, user } = await createLeaveRevision();
    const idempotencyKey = randomUUID();
    const data = {
      leaveRequestId: request.id,
      revisionId: revision.id,
      fromStatus: "DRAFT" as const,
      toStatus: "SUBMITTED" as const,
      actorUserId: user.id,
      occurredAt: new Date(),
      idempotencyKey,
    };
    await database.leaveRequestTransition.create({ data });
    await expect(database.leaveRequestTransition.create({ data })).rejects.toThrow();
  });

  it("rejects duplicate permission transition idempotency keys", async () => {
    const { request, revision, user } = await createPermissionRevision();
    const idempotencyKey = randomUUID();
    const data = {
      permissionRequestId: request.id,
      revisionId: revision.id,
      fromStatus: "DRAFT" as const,
      toStatus: "SUBMITTED" as const,
      actorUserId: user.id,
      occurredAt: new Date(),
      idempotencyKey,
    };
    await database.permissionRequestTransition.create({ data });
    await expect(database.permissionRequestTransition.create({ data })).rejects.toThrow();
  });

  it("restricts deletion of workflow history references", async () => {
    const { request, revision, user } = await createLeaveRevision();
    await database.leaveRequestTransition.create({
      data: {
        leaveRequestId: request.id,
        revisionId: revision.id,
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        actorUserId: user.id,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      },
    });
    await expect(
      database.leaveRequest.delete({ where: { id: request.id } }),
    ).rejects.toThrow();
    await expect(
      database.leaveRequestRevision.delete({ where: { id: revision.id } }),
    ).rejects.toThrow();
    await expect(
      database.user.delete({ where: { id: user.id } }),
    ).rejects.toThrow();
  });

  it("allows PermissionType deactivation without invalidating referenced history", async () => {
    const { permissionType, revision } = await createPermissionRevision();
    const deactivated = await database.permissionType.update({
      where: { id: permissionType.id },
      data: { isActive: false },
    });
    expect(deactivated.isActive).toBe(false);
    expect(
      await database.permissionRequestRevision.findUnique({ where: { id: revision.id } }),
    ).toMatchObject({ permissionTypeId: permissionType.id });
    await expect(
      database.permissionType.delete({ where: { id: permissionType.id } }),
    ).rejects.toThrow();
  });

  it("has no permission workflow foreign key to annual balance tables", async () => {
    const foreignKeys = await database.$queryRaw<Array<{ target_table: string }>>`
      SELECT confrelid::regclass::text AS target_table
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid IN (
          '"PermissionRequest"'::regclass,
          '"PermissionRequestRevision"'::regclass,
          '"PermissionRequestTransition"'::regclass
        )
    `;
    expect(foreignKeys.map(({ target_table }) => target_table)).not.toContain(
      '"AnnualBalanceAccount"',
    );
    expect(foreignKeys.map(({ target_table }) => target_table)).not.toContain(
      '"AnnualBalanceOperation"',
    );
  });
});
