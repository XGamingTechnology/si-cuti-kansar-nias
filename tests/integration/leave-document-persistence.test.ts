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

  function documentInput(
    requestId: string,
    revisionId: string,
    version = 1,
  ) {
    return {
      leaveRequestId: requestId,
      revisionId,
      documentType: "APPROVED_FORM" as const,
      version,
      storageKey: randomUUID().replaceAll("-", ""),
      checksumSha256: "a".repeat(64),
      sizeBytes: 12_345,
      mimeType: "application/pdf",
      originalFileName: `cuti-v${version}.pdf`,
      uploadedByUserId: null,
      uploadedAt: new Date("2099-04-05T06:07:08.123Z"),
      sourceIp: "127.0.0.1",
      snapshot: { employee: { fullName: "Pegawai Uji Dokumen" }, revision: 1 },
      generatedAt: new Date("2099-04-05T06:07:08.123Z"),
    };
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

  it("persists versioned signed-document metadata and returns newest first", async () => {
    const { request, revision } = await createLeave();
    const first = await repository.create(
      documentInput(request.id, revision.id, 1),
    );
    const second = await repository.create({
      ...documentInput(request.id, revision.id, 2),
      checksumSha256: "b".repeat(64),
    });

    await expect(
      repository.findByRevisionAndType(revision.id, "APPROVED_FORM"),
    ).resolves.toEqual(second);
    await expect(repository.findById(first.id)).resolves.toEqual(first);
    await expect(repository.listForLeaveRequest(request.id)).resolves.toEqual([
      second,
      first,
    ]);
    await expect(
      repository.nextVersion(revision.id, "APPROVED_FORM"),
    ).resolves.toBe(3);
  });

  it("enforces version and storage-key uniqueness while allowing later versions", async () => {
    const { request, revision } = await createLeave();
    const base = documentInput(request.id, revision.id, 1);
    await repository.create(base);

    await expect(
      repository.create({ ...base, storageKey: randomUUID().replaceAll("-", "") }),
    ).rejects.toThrow();

    await expect(
      repository.create({
        ...base,
        version: 2,
        storageKey: randomUUID().replaceAll("-", ""),
      }),
    ).resolves.toMatchObject({ version: 2 });
  });

  it("rejects a document whose revision belongs to another request", async () => {
    const first = await createLeave();
    const second = await createLeave();

    await expect(
      repository.create(
        documentInput(first.request.id, second.revision.id, 1),
      ),
    ).rejects.toThrow();
  });

  it("restricts deletion of requests and revisions referenced by documents", async () => {
    const { request, revision } = await createLeave();
    await repository.create(documentInput(request.id, revision.id, 1));

    await expect(
      database.leaveRequest.delete({ where: { id: request.id } }),
    ).rejects.toThrow();
    await expect(
      database.leaveRequestRevision.delete({ where: { id: revision.id } }),
    ).rejects.toThrow();
  });
});
