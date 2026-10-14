import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaWorkflowRepository } from "@/infrastructure/workflow/prisma-workflow-repository";
import { PrismaLeaveRecordsRepository } from "@/infrastructure/leave-records/prisma-repository";
import { PrismaLeaveDocumentRepository } from "@/infrastructure/leave-documents/prisma-leave-document-repository";
import { PrismaAnnualBalanceRepository } from "@/infrastructure/leave-balance/prisma-annual-balance-repository";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { LeaveWorkflowService } from "@/application/workflow/leave-service";
import { LeaveDocumentService } from "@/application/leave-documents/service";
import { LeaveRecordsService } from "@/application/leave-records/service";
import { AnnualRolloverService } from "@/application/leave-balance/rollover-service";
import type {
  LeaveRecordsRepository,
  ReturnTransaction,
} from "@/application/leave-records/ports";
import type { Principal } from "@/modules/auth/service";

const run =
  process.env.SI_CUTI_DISPOSABLE_TEST_DB === "1" && process.env.DATABASE_URL
    ? describe
    : describe.skip;
run("decision archives and leave returns on disposable PostgreSQL", () => {
  const database = createDatabaseClient();
  const workflow = new LeaveWorkflowService(
    new PrismaWorkflowRepository(database),
  );
  const repository = new PrismaLeaveRecordsRepository(database);
  const employees: string[] = [];
  let directory: string,
    storage: LocalPrivateStorage,
    records: LeaveRecordsService,
    documents: LeaveDocumentService;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "si-cuti-records-test-"));
    storage = new LocalPrivateStorage(directory);
    records = new LeaveRecordsService({ repository, storage });
    documents = new LeaveDocumentService(
      new PrismaLeaveDocumentRepository(database),
      storage,
    );
  });
  afterEach(async () => {
    const where = { leaveRequest: { employeeId: { in: employees } } };
    await database.leaveDecisionArtifact.deleteMany({
      where: { archive: where },
    });
    await database.leaveDecisionEdition.deleteMany({
      where: { archive: where },
    });
    await database.leaveDecisionArchive.deleteMany({ where });
    await database.leaveBalanceReturnOperation.deleteMany({
      where: { returnRecord: where },
    });
    await database.leaveBalanceReturn.deleteMany({ where });
    await database.annualBalanceOperation.deleteMany({
      where: {
        employeeId: { in: employees },
        compensatesOperationId: { not: null },
      },
    });
    await database.annualBalanceOperation.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.annualRolloverCommit.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.n2QualifyingPeriod.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.leaveRequestTransition.deleteMany({ where });
    await database.leaveDocument.deleteMany({ where });
    await database.leaveRequestRevision.deleteMany({ where });
    await database.leaveRequest.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.annualBalanceAccount.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.user.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await database.employee.deleteMany({ where: { id: { in: employees } } });
    employees.length = 0;
  });
  afterAll(async () => {
    await database.$disconnect();
    await rm(directory, { recursive: true, force: true });
  });
  async function actor(role: Principal["role"] = "PEGAWAI") {
    const e = await database.employee.create({
      data: {
        nip: "REC-" + randomUUID().slice(0, 26),
        fullName: "Pegawai Arsip Sintetis",
        positionTitle: "Penguji",
        workUnit: "Unit Uji",
      },
    });
    employees.push(e.id);
    const u = await database.user.create({ data: { employeeId: e.id, role } });
    return {
      userId: u.id,
      employeeId: e.id,
      role,
      fullName: e.fullName,
    } satisfies Principal;
  }
  async function pdf() {
    const p = await PDFDocument.create();
    p.addPage([400, 300]);
    return p.save();
  }
  async function seed(approve = true) {
    const owner = await actor(),
      admin = await actor("ADMIN_KEPEGAWAIAN");
    await database.annualBalanceAccount.createMany({
      data: [
        ...[
          ["JOINT_LEAVE_CLAIM", 2],
          ["N2", 3],
          ["N1", 6],
          ["N", 12],
        ].map(([bucket, grantedDays]) => ({
          employeeId: owner.employeeId,
          entitlementYear: 2099,
          bucket: bucket as "N" | "N1" | "N2" | "JOINT_LEAVE_CLAIM",
          grantedDays: grantedDays as number,
        })),
        ...["JOINT_LEAVE_CLAIM", "N2", "N1", "N"].map((bucket) => ({
          employeeId: owner.employeeId,
          entitlementYear: 2098,
          bucket: bucket as "N",
          grantedDays: bucket === "N" ? 12 : 0,
        })),
      ],
    });
    const draft = await workflow.createDraft(owner, {
      leaveType: "ANNUAL",
      startDate: "2099-01-12",
      endDate: "2099-01-20",
      reason: "Uji cuti tahunan",
      formPlace: "Kota Uji",
      leaveAddress: "Alamat sintetis",
      leavePhone: "000000",
    });
    await workflow.submit(owner, draft.id, randomUUID());
    const request = await workflow.get(owner, draft.id);
    const content = await pdf();
    const upload = {
      leaveRequestId: request.id,
      revisionId: request.currentRevision.id,
      uploadedByUserId: owner.userId,
      originalFileName: "scan-sintetis.pdf",
      mimeType: "application/pdf",
      sourceIp: null,
      content,
      snapshot: { synthetic: true },
    };
    const doc = await documents.uploadApprovedForm(upload);
    if (approve)
      await workflow.approve(
        admin,
        request.id,
        "BASIS-01",
        randomUUID(),
        new Date(),
        doc.id,
      );
    return { owner, admin, request, doc, upload };
  }
  async function evidence(f: Awaited<ReturnType<typeof seed>>) {
    const d = await documents.uploadReturnEvidence({
      ...f.upload,
      uploadedByUserId: f.admin.userId,
      originalFileName: "dasar-pengembalian.pdf",
    });
    return {
      restoredDays: 5,
      reason: "Dipanggil kembali untuk tugas resmi",
      basisReference: "TUGAS-01",
      basisDate: "2099-01-13",
      evidenceDocumentId: d.id,
      unusedDaysConfirmed: true,
    };
  }
  it("pins exact scan and immutable snapshot, generates final PDF once, and denies foreign owners", async () => {
    const f = await seed(false);
    const second = await documents.uploadApprovedForm({
      ...f.upload,
      originalFileName: "scan-versi-dua.pdf",
    });
    await expect(
      workflow.approve(f.admin, f.request.id, "BASIS", randomUUID()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const key = randomUUID();
    await workflow.approve(
      f.admin,
      f.request.id,
      "BASIS",
      key,
      new Date(),
      f.doc.id,
    );
    await workflow.approve(
      f.admin,
      f.request.id,
      "BASIS",
      key,
      new Date(),
      f.doc.id,
    );
    await expect(
      workflow.approve(
        f.admin,
        f.request.id,
        "BASIS",
        key,
        new Date(),
        second.id,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await database.employee.update({
      where: { id: f.owner.employeeId },
      data: { fullName: "Nama setelah persetujuan" },
    });
    const decision = await records.decision(f.owner, f.request.id);
    expect(decision?.snapshot.employeeName).toBe("Pegawai Arsip Sintetis");
    expect(decision?.sourceDocumentId).toBe(f.doc.id);
    const first = await records.decisionDocument(f.owner, f.request.id),
      retry = await records.decisionDocument(f.owner, f.request.id);
    expect(Buffer.from(first.content)).toEqual(Buffer.from(retry.content));
    expect((await PDFDocument.load(first.content)).getPageCount()).toBe(2);
    expect(
      await database.leaveDecisionArchive.count({
        where: { leaveRequestId: f.request.id },
      }),
    ).toBe(1);
    expect(await database.leaveDecisionArtifact.count()).toBeGreaterThan(0);
    const sourceChecksum = decision!.snapshot.sourceChecksumSha256!;
    const placement = {
      page: 1,
      left: 0.05,
      top: 0.7,
      width: 0.3,
      height: 0.12,
    };
    const preview = await records.previewDecisionEdition(
      f.admin,
      f.request.id,
      placement,
      sourceChecksum,
    );
    expect(await database.leaveDecisionEdition.count()).toBe(0);
    const editionKey = randomUUID();
    const [edition, same] = await Promise.all(
      [1, 2].map(() =>
        records.saveDecisionEdition(
          f.admin,
          f.request.id,
          placement,
          sourceChecksum,
          editionKey,
          true,
          preview.fingerprint,
        ),
      ),
    );
    expect(same).toEqual(edition);
    expect(await database.leaveDecisionEdition.count()).toBe(1);
    const frozen = JSON.stringify(decision!.snapshot);
    const nextPlacement = { ...placement, left: 0.35 };
    const secondPreview = await records.previewDecisionEdition(
      f.admin,
      f.request.id,
      nextPlacement,
      sourceChecksum,
    );
    const secondEdition = await records.saveDecisionEdition(
      f.admin,
      f.request.id,
      nextPlacement,
      sourceChecksum,
      randomUUID(),
      true,
      secondPreview.fingerprint,
    );
    expect(secondEdition.version).toBe(2);
    expect(
      (await records.decision(f.owner, f.request.id))!.editions,
    ).toHaveLength(2);
    expect(
      JSON.stringify((await records.decision(f.owner, f.request.id))!.snapshot),
    ).toBe(frozen);
    const old = await records.decisionDocument(
      f.owner,
      f.request.id,
      edition.id,
    );
    const latest = await records.decisionDocument(f.owner, f.request.id);
    expect(Buffer.from(old.content)).not.toEqual(Buffer.from(latest.content));
    expect(await database.leaveDecisionArtifact.count()).toBe(1);
    const saved = await database.leaveDecisionEdition.findUniqueOrThrow({
      where: { id: edition.id },
    });
    expect(saved.createdByUserId).toBe(f.admin.userId);
    expect(saved.sourceVerified).toBe(true);
    expect(saved.sourceChecksumSha256).toBe(sourceChecksum);

    await expect(
      records.decisionDocument(await actor(), f.request.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(documents.uploadApprovedForm(f.upload)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("requires an explicit legacy review, preserves decision/ledger and records review provenance", async () => {
    const f = await seed();
    await database.leaveDecisionArchive.deleteMany({
      where: { leaveRequestId: f.request.id },
    });
    const before = await database.annualBalanceOperation.findMany({
      where: { employeeId: f.owner.employeeId },
    });
    await expect(
      records.decisionDocument(f.owner, f.request.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      records.verifyLegacyDecision(f.owner, f.request.id, f.doc.id, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await records.verifyLegacyDecision(f.admin, f.request.id, f.doc.id, true);
    const archived = await records.decision(f.owner, f.request.id);
    expect(archived?.snapshot.sourceReview?.actorUserId).toBe(f.admin.userId);
    expect(archived?.sourceDocumentId).toBe(f.doc.id);
    expect(
      await database.annualBalanceOperation.findMany({
        where: { employeeId: f.owner.employeeId },
      }),
    ).toEqual(before);
    expect(
      (
        await PDFDocument.load(
          (await records.decisionDocument(f.owner, f.request.id)).content,
        )
      ).getPageCount(),
    ).toBe(2);
  });
  it("creates a rejection notice without requiring a scan and freezes the reason", async () => {
    const owner = await actor(),
      admin = await actor("ADMIN_KEPEGAWAIAN");
    const d = await workflow.createDraft(owner, {
      leaveType: "SICK",
      startDate: "2099-01-12",
      endDate: "2099-01-13",
      reason: "Uji",
      formPlace: "Kota Uji",
      leaveAddress: "Alamat Uji",
      leavePhone: "000",
    });
    await workflow.submit(owner, d.id, randomUUID());
    await workflow.reject(
      admin,
      d.id,
      "Alasan penolakan resmi é → dicatat",
      randomUUID(),
    );
    const record = await records.decision(owner, d.id);
    expect(record?.sourceDocumentId).toBeNull();
    expect(record?.snapshot.reason).toContain("é →");
    expect(
      (
        await PDFDocument.load(
          (await records.decisionDocument(owner, d.id)).content,
        )
      ).getPageCount(),
    ).toBe(1);
  });
  it("atomically restores original allocations, links audit, retries and supports a second partial return", async () => {
    const f = await seed(),
      input = await evidence(f);
    const p = await records.preview(f.admin, f.request.id, input),
      key = randomUUID();
    const r = await records.apply(
      f.admin,
      f.request.id,
      input,
      key,
      p.fingerprint,
      "127.0.0.1",
    );
    expect(
      (
        await records.apply(
          f.admin,
          f.request.id,
          input,
          key,
          p.fingerprint,
          null,
        )
      ).id,
    ).toBe(r.id);
    expect(r.snapshot.allocations.map((o) => [o.bucket, o.days])).toEqual([
      ["N1", 2],
      ["N2", 3],
    ]);
    expect(
      await database.leaveBalanceReturnOperation.count({
        where: { returnId: r.id },
      }),
    ).toBe(2);
    expect((await workflow.get(f.owner, f.request.id)).status).toBe("APPROVED");
    const second = { ...input, restoredDays: 2 };
    const next = await records.preview(f.admin, f.request.id, second);
    await records.apply(
      f.admin,
      f.request.id,
      second,
      randomUUID(),
      next.fingerprint,
      null,
    );
    const rolled = await new AnnualRolloverService(
      new PrismaAnnualBalanceRepository(database),
    ).previewAnnualRollover({
      employeeId: f.owner.employeeId,
      targetYear: 2100,
    });
    expect(rolled.previousYearEffectiveAnnualLeaveUsageDays).toBe(0);
    expect(rolled.currentN2WasUsed).toBe(false);
  });
  it("serializes concurrent different commands and rejects stale preview without over-restoring", async () => {
    const f = await seed(),
      input = await evidence(f),
      other = await actor("ADMIN_KEPEGAWAIAN");
    const p = await records.preview(f.admin, f.request.id, input);
    const attempts = await Promise.allSettled([
      records.apply(
        f.admin,
        f.request.id,
        input,
        randomUUID(),
        p.fingerprint,
        null,
      ),
      records.apply(
        other,
        f.request.id,
        input,
        randomUUID(),
        p.fingerprint,
        null,
      ),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await database.leaveBalanceReturn.count({
        where: { leaveRequestId: f.request.id },
      }),
    ).toBe(1);
    expect(
      (
        await database.annualBalanceOperation.aggregate({
          where: { employeeId: f.owner.employeeId, operationType: "REVERSAL" },
          _sum: { days: true },
        })
      )._sum.days,
    ).toBe(5);
  });
  it("serializes a real rollover against reversal and preserves the derived N2 grant", async () => {
    const f = await seed(),
      input = await evidence(f),
      p = await records.preview(f.admin, f.request.id, input);
    const rollover = new AnnualRolloverService(
      new PrismaAnnualBalanceRepository(database),
    );
    const [returned, rolled] = await Promise.allSettled([
      records.apply(
        f.admin,
        f.request.id,
        input,
        randomUUID(),
        p.fingerprint,
        null,
      ),
      rollover.commitAnnualRollover({
        employeeId: f.owner.employeeId,
        targetYear: 2100,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(rolled.status).toBe("fulfilled");
    const n2 = await database.annualBalanceAccount.findUnique({
      where: {
        employeeId_entitlementYear_bucket: {
          employeeId: f.owner.employeeId,
          entitlementYear: 2100,
          bucket: "N2",
        },
      },
    });
    expect(n2?.grantedDays).toBe(returned.status === "fulfilled" ? 3 : 0);
    if (returned.status === "rejected")
      expect(returned.reason).toMatchObject({ code: "UNSUPPORTED_POLICY" });
  });
  it("rolls back real ledger/counters when audit persistence fails", async () => {
    const f = await seed(),
      input = await evidence(f),
      p = await records.preview(f.admin, f.request.id, input);
    const failing: LeaveRecordsRepository = {
      saveEdition: repository.saveEdition.bind(repository),
      verifyLegacyDecision: repository.verifyLegacyDecision.bind(repository),
      decision: repository.decision.bind(repository),
      createArtifact: repository.createArtifact.bind(repository),
      returns: repository.returns.bind(repository),
      withReturnTransaction: (id, work) =>
        repository.withReturnTransaction(id, (tx) =>
          work({
            ...tx,
            create: async () => {
              throw new Error("forced audit failure");
            },
          } as ReturnTransaction),
        ),
    };
    const service = new LeaveRecordsService({ repository: failing, storage });
    await expect(
      service.apply(
        f.admin,
        f.request.id,
        input,
        randomUUID(),
        p.fingerprint,
        null,
      ),
    ).rejects.toThrow("forced audit failure");
    expect(
      await database.leaveBalanceReturn.count({
        where: { leaveRequestId: f.request.id },
      }),
    ).toBe(0);
    expect(
      await database.annualBalanceOperation.count({
        where: { employeeId: f.owner.employeeId, operationType: "REVERSAL" },
      }),
    ).toBe(0);
    expect(
      (
        await database.annualBalanceAccount.aggregate({
          where: { employeeId: f.owner.employeeId, entitlementYear: 2099 },
          _sum: { committedDays: true },
        })
      )._sum.committedDays,
    ).toBe(7);
  });
  it("blocks downstream rollover cases and rejects foreign evidence without writes", async () => {
    const f = await seed(),
      input = await evidence(f);
    await expect(
      records.preview(f.owner, f.request.id, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const foreign = await seed(),
      foreignInput = await evidence(foreign);
    await expect(
      records.preview(f.admin, f.request.id, {
        ...input,
        evidenceDocumentId: foreignInput.evidenceDocumentId,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await database.annualRolloverCommit.create({
      data: {
        employeeId: f.owner.employeeId,
        targetYear: 2100,
        committedAt: new Date(),
        idempotencyKey: randomUUID(),
      },
    });
    await expect(
      records.preview(f.admin, f.request.id, input),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_POLICY" });
    expect(
      await database.leaveBalanceReturn.count({
        where: { leaveRequestId: f.request.id },
      }),
    ).toBe(0);
  });
});
