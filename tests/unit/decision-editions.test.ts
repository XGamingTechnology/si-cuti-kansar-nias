import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import {
  generateDecisionPdf,
  validateDecisionPlacement,
  decisionTime,
} from "@/application/leave-records/decision-pdf";
import { LeaveRecordsService } from "@/application/leave-records/service";
import type {
  DecisionArchive,
  DecisionEdition,
  LeaveRecordsRepository,
  DecisionSnapshot,
} from "@/application/leave-records/ports";
import type { DocumentStorage } from "@/application/ports/document-storage";
import type { Principal } from "@/modules/auth/service";
const admin: Principal = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  role: "ADMIN_KEPEGAWAIAN",
  fullName: "Admin Sintetis",
};
const owner: Principal = {
  ...admin,
  userId: randomUUID(),
  employeeId: randomUUID(),
  role: "PEGAWAI",
};
const snapshot: DecisionSnapshot = {
  status: "APPROVED",
  requestId: randomUUID(),
  revisionId: randomUUID(),
  revisionNumber: 1,
  employeeId: owner.employeeId,
  employeeName: "Pegawai Sintetis",
  employeeNip: "UJI-001",
  startDate: "2099-01-05",
  endDate: "2099-01-09",
  leaveType: "ANNUAL",
  actorUserId: admin.userId,
  actorName: admin.fullName,
  occurredAt: "2099-01-04T18:00:00Z",
  reason: null,
  evidenceReference: "UJI-01",
  sourceDocumentVersion: 1,
  sourceChecksumSha256: null,
};
const placement = { page: 1, left: 0.05, top: 0.65, width: 0.4, height: 0.15 };
async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 300]);
  const scan = await pdf.save();
  const checksum = createHash("sha256").update(scan).digest("hex");
  const editions: DecisionEdition[] = [];
  const archive: DecisionArchive = {
    id: randomUUID(),
    leaveRequestId: snapshot.requestId,
    revisionId: snapshot.revisionId,
    transitionId: randomUUID(),
    sourceDocumentId: randomUUID(),
    sourceStorageKey: "source",
    snapshot: { ...snapshot, sourceChecksumSha256: checksum },
    artifact: { id: "old", key: "original-artifact", checksum: "old", size: 1 },
    editions,
  };
  const files = new Map<string, Uint8Array>([["source", scan]]);
  const storage: DocumentStorage = {
    read: vi.fn(async (k) => {
      const b = files.get(k);
      if (!b) throw Error("Missing");
      return b;
    }),
    put: vi.fn(async (bytes) => {
      const key = randomUUID();
      files.set(key, bytes);
      return {
        key,
        size: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
    delete: vi.fn(async (k) => {
      files.delete(k);
    }),
  };
  const repository = {
    decision: vi.fn(async () => archive),
    saveEdition: vi.fn(async (record: Omit<DecisionEdition, "version">) => {
      const retry = editions.find(
        (e) => e.idempotencyKey === record.idempotencyKey,
      );
      if (retry) return retry;
      const e = { ...record, version: editions.length + 1 };
      editions.unshift(e);
      return e;
    }),
    withReturnTransaction: vi.fn(),
  } as unknown as LeaveRecordsRepository;
  const service = new LeaveRecordsService({ repository, storage });
  return {
    service,
    repository,
    storage,
    archive,
    files,
    scan,
    checksum,
    editions,
  };
}
describe("decision editions", () => {
  it.each([0, 90, 180, 270])(
    "preserves rotated/cropped source at %i degrees and original bytes",
    async (angle) => {
      const p = await PDFDocument.create();
      const page = p.addPage([500, 400]);
      page.setCropBox(20, 30, 400, 300);
      page.setRotation(degrees(angle));
      const scan = await p.save();
      const before = createHash("sha256").update(scan).digest("hex");
      const out = await PDFDocument.load(
        await generateDecisionPdf("test-archive", snapshot, scan, placement),
      );
      expect(out.getPage(0).getCropBox()).toEqual({
        x: 20,
        y: 30,
        width: 400,
        height: 300,
      });
      expect(out.getPage(0).getRotation().angle).toBe(angle);
      expect(out.getPageCount()).toBe(2);
      expect(createHash("sha256").update(scan).digest("hex")).toBe(before);
    },
  );
  it("rejects bounds, NaN and unavailable pages instead of stamping another page", async () => {
    for (const p of [
      { ...placement, left: -0.1 },
      { ...placement, top: 0.99 },
      { ...placement, page: 1.5 },
      { ...placement, width: NaN },
    ])
      expect(() => validateDecisionPlacement(p)).toThrow();
    const f = await fixture();
    await expect(
      f.service.previewDecisionEdition(
        admin,
        snapshot.requestId,
        { ...placement, page: 2 },
        f.checksum,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(f.storage.put).not.toHaveBeenCalled();
  });
  it("formats decision time as WIB across date boundaries", () =>
    expect(decisionTime(snapshot.occurredAt)).toMatch(
      /05 Januari 2099.*01[.:]00.*WIB/,
    ));
  it("fits a long Admin identity across wrapped lines in a taller marker", async () => {
    const scan = await PDFDocument.create();
    scan.addPage([400, 300]);
    const result = await generateDecisionPdf(
      "long-actor",
      {
        ...snapshot,
        actorName:
          "Admin Kepegawaian Dokumentasi Wilayah Contoh Nusantara Sintetis",
      },
      await scan.save(),
      { page: 1, left: 0.05, top: 0.6, width: 0.55, height: 0.2 },
    );
    expect((await PDFDocument.load(result)).getPageCount()).toBe(2);
  });
  it("previews without writes, requires confirmation/fingerprint and denies Pegawai mutation", async () => {
    const f = await fixture();
    await expect(
      f.service.previewDecisionEdition(
        owner,
        snapshot.requestId,
        placement,
        f.checksum,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const preview = await f.service.previewDecisionEdition(
      admin,
      snapshot.requestId,
      placement,
      f.checksum,
    );
    expect(preview.content.length).toBeGreaterThan(100);
    expect(f.storage.put).not.toHaveBeenCalled();
    await expect(
      f.service.saveDecisionEdition(
        admin,
        snapshot.requestId,
        placement,
        f.checksum,
        randomUUID(),
        false,
        preview.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      f.service.saveDecisionEdition(
        admin,
        snapshot.requestId,
        { ...placement, left: 0.2 },
        f.checksum,
        randomUUID(),
        true,
        preview.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.editions).toHaveLength(0);
  });
  it("saves immutable editions, retries once, and owners can retrieve older editions", async () => {
    const f = await fixture();
    const frozen = JSON.stringify(f.archive.snapshot),
      key = randomUUID();
    const p = await f.service.previewDecisionEdition(
      admin,
      snapshot.requestId,
      placement,
      f.checksum,
    );
    const first = await f.service.saveDecisionEdition(
      admin,
      snapshot.requestId,
      placement,
      f.checksum,
      key,
      true,
      p.fingerprint,
    );
    expect(
      await f.service.saveDecisionEdition(
        admin,
        snapshot.requestId,
        placement,
        f.checksum,
        key,
        true,
        p.fingerprint,
      ),
    ).toEqual(first);
    expect(f.editions).toHaveLength(1);
    const next = { ...placement, left: 0.3 };
    const preview = await f.service.previewDecisionEdition(
      admin,
      snapshot.requestId,
      next,
      f.checksum,
    );
    await f.service.saveDecisionEdition(
      admin,
      snapshot.requestId,
      next,
      f.checksum,
      randomUUID(),
      true,
      preview.fingerprint,
    );
    expect(f.editions).toHaveLength(2);
    expect(
      (await f.service.decisionDocument(owner, snapshot.requestId, first.id))
        .content,
    ).toEqual(f.files.get(f.editions[1].key));
    expect(
      (await f.service.decisionDocument(owner, snapshot.requestId)).content,
    ).toEqual(f.files.get(f.editions[0].key));
    expect(JSON.stringify(f.archive.snapshot)).toBe(frozen);
    expect(f.files.get("source")).toEqual(f.scan);
    expect(f.repository.withReturnTransaction).not.toHaveBeenCalled();
    await expect(
      f.service.decisionDocument(
        { ...owner, employeeId: randomUUID() },
        snapshot.requestId,
        first.id,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.service.decisionDocument(owner, snapshot.requestId, randomUUID()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("detects source corruption and cleans stored output on persistence failure", async () => {
    const f = await fixture();
    const p = await f.service.previewDecisionEdition(
      admin,
      snapshot.requestId,
      placement,
      f.checksum,
    );
    vi.mocked(f.repository.saveEdition).mockRejectedValueOnce(
      Error("DB failure"),
    );
    await expect(
      f.service.saveDecisionEdition(
        admin,
        snapshot.requestId,
        placement,
        f.checksum,
        randomUUID(),
        true,
        p.fingerprint,
      ),
    ).rejects.toThrow("DB failure");
    expect(f.storage.delete).toHaveBeenCalledOnce();
    f.files.set("source", new Uint8Array([1]));
    await expect(
      f.service.previewDecisionEdition(
        admin,
        snapshot.requestId,
        placement,
        f.checksum,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
