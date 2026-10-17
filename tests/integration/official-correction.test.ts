import { randomUUID, createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaOfficialCorrectionRepository } from "@/infrastructure/leave-authorized-official/correction-repository";
import { PrismaLeaveAuthorizedOfficialRepository } from "@/infrastructure/leave-authorized-official/prisma-repository";
import { OfficialCorrectionService } from "@/application/leave-authorized-official/correction";
import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { generateLeaveDocument } from "@/application/workflow/leave-document";
import { LeaveWorkflowService } from "@/application/workflow";
import { PrismaWorkflowRepository } from "@/infrastructure/workflow/prisma-workflow-repository";

const run =
  process.env.DATABASE_URL && process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1"
    ? describe
    : describe.skip;
run("official corrections on disposable PostgreSQL", () => {
  const db = createDatabaseClient();
  const repository = new PrismaOfficialCorrectionRepository(db);
  const clock = () => new Date("2026-10-17T01:00:00Z");
  const service = new OfficialCorrectionService(repository, clock);
  let year = 1000;
  async function fixture() {
    year++;
    while (
      await db.leaveAuthorizedOfficialAssignment.count({
        where: {
          effectiveFrom: {
            gte: new Date(`${year}-01-01Z`),
            lt: new Date(`${year + 1}-01-01Z`),
          },
        },
      })
    )
      year++;
    const employee = await db.employee.create({
      data: {
        nip: `COR-${randomUUID().slice(0, 24)}`,
        fullName: "Admin Koreksi Sintetis",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
      },
    });
    const user = await db.user.create({
      data: { employeeId: employee.id, role: "ADMIN_KEPEGAWAIAN" },
    });
    const assignment = await db.leaveAuthorizedOfficialAssignment.create({
      data: {
        fullName: "Pejabat Sebelum",
        nip: "OFFICIAL-TEST",
        capacity: "DEFINITIVE",
        effectiveFrom: new Date(`${year}-01-01Z`),
        effectiveTo: new Date(`${year}-06-30Z`),
      },
    });
    const actor = {
      userId: user.id,
      employeeId: employee.id,
      fullName: employee.fullName,
      role: "ADMIN_KEPEGAWAIAN" as const,
    };
    return {
      actor,
      assignment,
      value: {
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
        changes: { fullName: "Pejabat Sesudah" },
        reason: "Koreksi ejaan administratif",
        sourceReference: "SK-SINTETIS",
        confirmed: true as const,
      },
    };
  }
  // History is deliberately not deleted. Dispose the dedicated test database after use.
  afterAll(() => db.$disconnect());
  it("atomically persists server before/after, fields, actor and timestamp; history is append-only with FK restrictions", async () => {
    const f = await fixture();
    const record = await service.correct(f.actor, f.assignment.id, f.value);
    expect(record).toMatchObject({
      actorUserId: f.actor.userId,
      correctedAt: clock().toISOString(),
      revision: 1,
      fields: ["fullName"],
      before: { fullName: "Pejabat Sebelum" },
      after: { fullName: "Pejabat Sesudah" },
    });
    expect((await repository.history(f.assignment.id)).corrections).toEqual([
      record,
    ]);
    expect(
      await db.leaveAuthorizedOfficialAssignment.findUnique({
        where: { id: f.assignment.id },
      }),
    ).toMatchObject({ fullName: "Pejabat Sesudah", revision: 1 });
    await expect(
      db.leaveAuthorizedOfficialCorrection.update({
        where: { id: record.id },
        data: { reason: "rewrite" },
      }),
    ).rejects.toThrow();
    await expect(
      db.leaveAuthorizedOfficialCorrection.delete({ where: { id: record.id } }),
    ).rejects.toThrow();
    await expect(
      db.leaveAuthorizedOfficialAssignment.delete({
        where: { id: f.assignment.id },
      }),
    ).rejects.toThrow();
    await expect(
      db.user.delete({ where: { id: f.actor.userId } }),
    ).rejects.toThrow();
  });
  it("rolls back assignment when audit FK persistence fails", async () => {
    const f = await fixture();
    await expect(
      service.correct(
        { ...f.actor, userId: randomUUID() },
        f.assignment.id,
        f.value,
      ),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(
      await db.leaveAuthorizedOfficialAssignment.findUnique({
        where: { id: f.assignment.id },
      }),
    ).toMatchObject({ fullName: "Pejabat Sebelum", revision: 0 });
    expect(
      (await repository.history(f.assignment.id)).corrections,
    ).toHaveLength(0);
  });
  it("serializes identical concurrent retry and rejects reused key with different actor/payload", async () => {
    const f = await fixture();
    const results = await Promise.all([
      service.correct(f.actor, f.assignment.id, f.value),
      service.correct(f.actor, f.assignment.id, f.value),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      (await repository.history(f.assignment.id)).corrections,
    ).toHaveLength(1);
    await expect(
      service.correct(f.actor, f.assignment.id, { ...f.value, reason: "Lain" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.correct(
        { ...f.actor, userId: randomUUID() },
        f.assignment.id,
        f.value,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects stale concurrent correction without losing a winner", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      service.correct(f.actor, f.assignment.id, f.value),
      service.correct(f.actor, f.assignment.id, {
        ...f.value,
        idempotencyKey: randomUUID(),
        changes: { nip: "CORRECTED-NIP" },
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(
      (await repository.history(f.assignment.id)).corrections,
    ).toHaveLength(1);
  });
  it("normal edits advance revision and stale ordinary writes cannot overwrite a correction", async () => {
    const f = await fixture();
    const ordinary = new PrismaLeaveAuthorizedOfficialRepository(db);
    const current = (await ordinary.findById(f.assignment.id))!;
    const serviceNormal = new LeaveAuthorizedOfficialService(ordinary, clock);
    await serviceNormal.update(current.id, {
      ...current,
      notes: "Metadata diperbarui",
    });
    await expect(
      service.correct(f.actor, current.id, f.value),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await service.correct(f.actor, current.id, {
      ...f.value,
      expectedRevision: 1,
    });
    await expect(ordinary.update(current.id, current, 0)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
  });
  it("retains inclusive DB overlap protection and rolls back audit", async () => {
    const f = await fixture();
    await db.leaveAuthorizedOfficialAssignment.create({
      data: {
        fullName: "Penerus Sintetis",
        nip: "SUCCESSOR",
        capacity: "PLT",
        effectiveFrom: new Date(`${year}-07-01Z`),
        effectiveTo: new Date(`${year}-12-31Z`),
      },
    });
    await expect(
      service.correct(f.actor, f.assignment.id, {
        ...f.value,
        changes: { effectiveTo: `${year}-07-01` },
      }),
    ).rejects.toMatchObject({ code: "OVERLAP" });
    expect(
      (await repository.history(f.assignment.id)).corrections,
    ).toHaveLength(0);
    expect(
      (await ordinaryAssignment(f.assignment.id))?.effectiveTo
        ?.toISOString()
        .slice(0, 10),
    ).toBe(`${year}-06-30`);
  });
  function ordinaryAssignment(id: string) {
    return db.leaveAuthorizedOfficialAssignment.findUnique({ where: { id } });
  }
  it("no-op cannot append a fake correction", async () => {
    const f = await fixture();
    await expect(
      service.correct(f.actor, f.assignment.id, {
        ...f.value,
        changes: { fullName: f.assignment.fullName },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(
      (await repository.history(f.assignment.id)).corrections,
    ).toHaveLength(0);
  });
  it("preserves submitted PDF identity across multiple identity/period corrections and stored bytes/snapshot", async () => {
    const f = await fixture();
    const ordinary = new PrismaLeaveAuthorizedOfficialRepository(db);
    const officials = new LeaveAuthorizedOfficialService(ordinary);
    const workflow = new LeaveWorkflowService(new PrismaWorkflowRepository(db));
    const owner = { ...f.actor, role: "PEGAWAI" as const };
    const draft = await workflow.createDraft(owner, {
      leaveType: "SICK",
      startDate: `${year}-03-01`,
      endDate: `${year}-03-02`,
      reason: "Pengujian historis",
      formPlace: "Kota Uji",
      leaveAddress: "Alamat Uji",
      leavePhone: "000",
    });
    const submittedAt = new Date(`${year}-02-01T00:00:00Z`);
    await workflow.submit(owner, draft.id, randomUUID(), submittedAt);
    const leave = await workflow.get(owner, draft.id);
    const render = async () =>
      generateLeaveDocument(leave, [], "proof", undefined, {
        authorizedOfficial: await officials.resolveAt(submittedAt),
      });
    const bytesBefore = await render();
    const checksum = createHash("sha256").update(bytesBefore).digest("hex");
    const storage = new LocalPrivateStorage(
      `/tmp/si-cuti-issue91-${randomUUID()}`,
    );
    const { key: storageKey } = await storage.put(bytesBefore);
    const document = await db.leaveDocument.create({
      data: {
        leaveRequestId: draft.id,
        revisionId: leave.currentRevision.id,
        documentType: "APPROVED_FORM",
        storageKey,
        checksumSha256: checksum,
        sizeBytes: bytesBefore.length,
        snapshot: { official: { name: "Pejabat Sebelum" } },
        generatedAt: submittedAt,
      },
    });
    await service.correct(f.actor, f.assignment.id, f.value);
    await service.correct(f.actor, f.assignment.id, {
      ...f.value,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      changes: { effectiveTo: `${year}-01-31`, capacity: "PLT" },
    });
    await db.leaveAuthorizedOfficialAssignment.create({
      data: {
        fullName: "Pejabat Pengganti Sintetis",
        nip: "REPLACEMENT-TEST",
        capacity: "DEFINITIVE",
        effectiveFrom: new Date(`${year}-02-01Z`),
        effectiveTo: new Date(`${year}-06-30Z`),
      },
    });
    expect(await render()).toEqual(bytesBefore);
    expect(
      await db.leaveDocument.findUnique({ where: { id: document.id } }),
    ).toEqual(document);
    expect(await workflow.get(owner, draft.id)).toEqual(leave);
    const stored = await storage.read(storageKey);
    expect(new Uint8Array(stored)).toEqual(new Uint8Array(bytesBefore));
  });
});
