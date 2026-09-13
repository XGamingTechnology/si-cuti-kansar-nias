import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaLeaveDocumentRepository } from "@/infrastructure/leave-documents/prisma-leave-document-repository";
import { createDatabaseClient } from "@/infrastructure/database/client";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("leave document persistence foundation", () => {
  const database = createDatabaseClient();
  const repository = new PrismaLeaveDocumentRepository(database);
  const employeeIds: string[] = [];

  async function createLeave() {
    const employee = await database.employee.create({
      data: {
        nip: `DOC-${randomUUID().replaceAll("-", "").slice(0, 27)}`,
        fullName: "Pegawai Uji Dokumen",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
      },
    });
    employeeIds.push(employee.id);
    const request = await database.leaveRequest.create({
      data: { employeeId: employee.id },
    });
    const revision = await database.leaveRequestRevision.create({
      data: {
        leaveRequestId: request.id,
        revisionNumber: 1,
        leaveType: "ANNUAL",
        startDate: new Date("2099-04-01T00:00:00.000Z"),
        endDate: new Date("2099-04-02T00:00:00.000Z"),
        reason: "Keperluan pengujian dokumen",
      },
    });
    return { employee, request, revision };
  }

  afterEach(async () => {
    await database.leaveDocument.deleteMany({
      where: { leaveRequest: { employeeId: { in: employeeIds } } },
    });
    await database.leaveRequestRevision.deleteMany({
      where: { leaveRequest: { employeeId: { in: employeeIds } } },
    });
    await database.leaveRequest.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await database.employee.deleteMany({ where: { id: { in: employeeIds } } });
    employeeIds.length = 0;
  });

  afterAll(() => database.$disconnect());

  it("keeps existing-style employees and revisions valid with nullable fields", async () => {
    const { employee, revision } = await createLeave();

    expect(employee.employmentStartDate).toBeNull();
    expect(revision.leaveAddress).toBeNull();
    expect(revision.leavePhone).toBeNull();
    expect(revision.formPlace).toBeNull();
  });

  it("persists leave address and phone on a new immutable revision", async () => {
    const { request } = await createLeave();
    const revision = await database.leaveRequestRevision.create({
      data: {
        leaveRequestId: request.id,
        revisionNumber: 2,
        leaveType: "SICK",
        startDate: new Date("2099-04-03T00:00:00.000Z"),
        endDate: new Date("2099-04-03T00:00:00.000Z"),
        reason: "Keperluan pengujian revisi",
        leaveAddress: "Alamat selama cuti untuk pengujian",
        leavePhone: "+6281234567890",
        formPlace: "Medan",
      },
    });

    expect(revision).toMatchObject({
      leaveAddress: "Alamat selama cuti untuk pengujian",
      leavePhone: "+6281234567890",
      formPlace: "Medan",
    });
  });

  it("creates and queries complete document metadata and its snapshot", async () => {
    const { request, revision } = await createLeave();
    const generatedAt = new Date("2099-04-05T06:07:08.123Z");
    const input = {
      leaveRequestId: request.id,
      revisionId: revision.id,
      documentType: "SUBMISSION_PROOF" as const,
      storageKey: `private/${randomUUID()}.pdf`,
      checksumSha256: "a".repeat(64),
      sizeBytes: 12_345,
      mimeType: "application/pdf",
      snapshot: { employee: { fullName: "Pegawai Uji Dokumen" }, revision: 1 },
      generatedAt,
    };

    const created = await repository.create(input);

    expect(created).toMatchObject(input);
    await expect(
      repository.findByRevisionAndType(revision.id, "SUBMISSION_PROOF"),
    ).resolves.toEqual(created);
    await expect(repository.findById(created.id)).resolves.toEqual(created);
    await expect(repository.listForLeaveRequest(request.id)).resolves.toEqual([
      created,
    ]);
  });

  it("enforces revision/type and storage-key uniqueness", async () => {
    const { request, revision } = await createLeave();
    const storageKey = `private/${randomUUID()}.pdf`;
    const base = {
      leaveRequestId: request.id,
      revisionId: revision.id,
      documentType: "APPROVED_FORM" as const,
      storageKey,
      checksumSha256: "b".repeat(64),
      sizeBytes: 42,
      mimeType: "application/pdf",
      snapshot: { revision: 1 },
      generatedAt: new Date(),
    };
    await repository.create(base);

    await expect(
      repository.create({ ...base, storageKey: `${storageKey}-other` }),
    ).rejects.toThrow();
    const second = await createLeave();
    await expect(
      repository.create({
        ...base,
        leaveRequestId: second.request.id,
        revisionId: second.revision.id,
      }),
    ).rejects.toThrow();
  });

  it("rejects a document whose revision belongs to another request", async () => {
    const first = await createLeave();
    const second = await createLeave();

    await expect(
      repository.create({
        leaveRequestId: first.request.id,
        revisionId: second.revision.id,
        documentType: "SUBMISSION_PROOF",
        storageKey: `private/${randomUUID()}.pdf`,
        checksumSha256: "c".repeat(64),
        sizeBytes: 84,
        mimeType: "application/pdf",
        snapshot: { revision: 1 },
        generatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("restricts deletion of requests and revisions referenced by documents", async () => {
    const { request, revision } = await createLeave();
    await repository.create({
      leaveRequestId: request.id,
      revisionId: revision.id,
      documentType: "SUBMISSION_PROOF",
      storageKey: `private/${randomUUID()}.pdf`,
      checksumSha256: "d".repeat(64),
      sizeBytes: 128,
      mimeType: "application/pdf",
      snapshot: { revision: 1 },
      generatedAt: new Date(),
    });

    await expect(
      database.leaveRequest.delete({ where: { id: request.id } }),
    ).rejects.toThrow();
    await expect(
      database.leaveRequestRevision.delete({ where: { id: revision.id } }),
    ).rejects.toThrow();
  });
});
