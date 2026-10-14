import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { LeaveRecordsService } from "@/application/leave-records/service";
import { generateDecisionPdf } from "@/application/leave-records/decision-pdf";
import type {
  DecisionArchive,
  DecisionSnapshot,
  LeaveRecordsRepository,
  ReturnInput,
  ReturnRecord,
  ReturnState,
  ReturnTransaction,
} from "@/application/leave-records/ports";
import type {
  AnnualBalanceMutationRepository,
  AnnualBalanceOperationRecord,
} from "@/application/leave-balance/ports";
import type { Principal } from "@/modules/auth/service";
import type { DocumentStorage } from "@/application/ports/document-storage";

const admin: Principal = {
  userId: "admin",
  employeeId: "admin-employee",
  role: "ADMIN_KEPEGAWAIAN",
  fullName: "Admin Uji",
};
const owner: Principal = {
  userId: "owner",
  employeeId: "employee",
  role: "PEGAWAI",
  fullName: "Pegawai Uji",
};
const snapshot: DecisionSnapshot = {
  status: "APPROVED",
  requestId: "request",
  revisionId: "revision",
  revisionNumber: 1,
  employeeId: "employee",
  employeeName: "Pegawai Uji",
  employeeNip: "TEST-001",
  startDate: "2099-01-12",
  endDate: "2099-01-20",
  leaveType: "ANNUAL",
  actorUserId: "admin",
  actorName: "Admin Uji",
  occurredAt: "2099-01-11T01:02:03Z",
  reason: null,
  evidenceReference: "BASIS-01",
  sourceDocumentVersion: 1,
  sourceChecksumSha256: null,
};
const input: ReturnInput = {
  restoredDays: 5,
  reason: "Dipanggil kembali untuk tugas resmi",
  basisReference: "TUGAS-01",
  basisDate: "2099-01-13",
  evidenceDocumentId: "evidence",
  unusedDaysConfirmed: true,
};
function fixture() {
  const commits: AnnualBalanceOperationRecord[] = [
    ["claim", "JOINT_LEAVE_CLAIM", 2],
    ["n2", "N2", 3],
    ["n1", "N1", 2],
  ].map(([id, bucket, days]) => ({
    id: id as string,
    employeeId: "employee",
    entitlementYear: 2099,
    bucket: bucket as AnnualBalanceOperationRecord["bucket"],
    operationType: "COMMIT",
    days: days as number,
    occurredAt: new Date("2099-01-11T00:00:00Z"),
    idempotencyKey: "commit-" + id,
    referenceType: "LEAVE_REQUEST_REVISION",
    referenceId: "revision",
    compensatesOperationId: null,
    reason: null,
  }));
  let state: ReturnState = {
    request: {
      id: "request",
      employeeId: "employee",
      employee: {
        id: "employee",
        nip: "TEST-001",
        fullName: "Pegawai Uji",
        positionTitle: "Staf",
        workUnit: "Unit Uji",
      },
      status: "APPROVED",
      currentRevisionNumber: 1,
      currentRevision: {
        id: "revision",
        requestId: "request",
        revisionNumber: 1,
        leaveType: "ANNUAL",
        startDate: "2099-01-12",
        endDate: "2099-01-20",
        reason: "Uji",
        calculatedWorkingDays: 7,
        submittedAt: new Date(),
      },
    },
    commits,
    reversals: [],
    hasDownstreamRollover: false,
    accounts: [
      ["JOINT_LEAVE_CLAIM", 2, 2],
      ["N2", 3, 3],
      ["N1", 6, 2],
      ["N", 12, 0],
    ].map(([bucket, grant, committed]) => ({
      id: "account-" + bucket,
      employeeId: "employee",
      entitlementYear: 2099,
      bucket: bucket as AnnualBalanceOperationRecord["bucket"],
      grantedDays: grant as number,
      reservedDays: 0,
      committedDays: committed as number,
      availableDays: (grant as number) - (committed as number),
    })),
  };
  let returns: ReturnRecord[] = [];
  let failCreate = false;
  const balance: AnnualBalanceMutationRepository = {
    withLockedAccounts: async (_employee, _year, _buckets, work) =>
      work({
        accounts: state.accounts,
        updateCounters: async (update) => {
          const old = state.accounts.find((a) => a.id === update.accountId)!;
          const next = {
            ...old,
            ...update,
            availableDays:
              update.grantedDays - update.reservedDays - update.committedDays,
          };
          state = {
            ...state,
            accounts: state.accounts.map((a) => (a.id === old.id ? next : a)),
          };
          return next;
        },
        append: async (o) => {
          const made = {
            ...o,
            id: randomUUID(),
            reason: o.reason ?? null,
            referenceType: o.referenceType ?? null,
            referenceId: o.referenceId ?? null,
            compensatesOperationId: o.compensatesOperationId ?? null,
          };
          state = { ...state, reversals: [...state.reversals, made] };
          return made;
        },
        findOperationsByReference: async () =>
          [...state.commits, ...state.reversals].reverse(),
        findReversalsForOperationIds: async (ids) =>
          state.reversals.filter((o) =>
            ids.includes(o.compensatesOperationId!),
          ),
      }),
  };
  const repository: LeaveRecordsRepository = {
    verifyLegacyDecision: vi.fn(async () => undefined),
    decision: vi.fn(async () => null),
    createArtifact: vi.fn(),
    returns: async () => returns,
    withReturnTransaction: async (_id, work) => {
      const before = structuredClone(state),
        beforeReturns = structuredClone(returns);
      const tx: ReturnTransaction = {
        state,
        annualBalanceRepository: balance,
        findRetry: async (key) =>
          returns.find((r) => r.idempotencyKey === key) ?? null,
        evidence: async (id) =>
          id === "evidence"
            ? {
                revisionId: "revision",
                leaveRequestId: "request",
                checksum: createHash("sha256")
                  .update(new Uint8Array([1, 2, 3]))
                  .digest("hex"),
                storageKey: "evidence-key",
                documentType: "RETURN_BASIS",
              }
            : null,
        freshAccounts: async () => state.accounts,
        create: async (r) => {
          if (failCreate) throw new Error("forced persistence failure");
          returns.push(r);
          return r;
        },
      };
      try {
        return await work(tx);
      } catch (e) {
        state = before;
        returns = beforeReturns;
        throw e;
      }
    },
  };
  const storage: DocumentStorage = {
    put: vi.fn(),
    read: vi.fn(async () => new Uint8Array([1, 2, 3])),
    delete: vi.fn(async () => undefined),
  };
  const service = new LeaveRecordsService({ repository, storage });
  return {
    service,
    repository,
    storage,
    state: () => state,
    returns: () => returns,
    setRollover: () => {
      state = { ...state, hasDownstreamRollover: true };
    },
    fail: () => {
      failCreate = true;
    },
  };
}
describe("auditable annual-leave returns", () => {
  it("previews reverse original allocation without mutations", async () => {
    const f = fixture();
    const p = await f.service.preview(admin, "request", input);
    expect(
      p.allocations.map((a) => [a.bucket, a.days, a.compensatesOperationId]),
    ).toEqual([
      ["N1", 2, "n1"],
      ["N2", 3, "n2"],
    ]);
    expect(f.state().reversals).toHaveLength(0);
    expect(f.returns()).toHaveLength(0);
  });
  it("applies, retries once, returns fresh counters and keeps APPROVED", async () => {
    const f = fixture();
    const p = await f.service.preview(admin, "request", input);
    const key = randomUUID();
    const first = await f.service.apply(
      admin,
      "request",
      input,
      key,
      p.fingerprint,
      null,
    );
    expect(
      (await f.service.apply(admin, "request", input, key, p.fingerprint, null))
        .id,
    ).toBe(first.id);
    expect(f.returns()).toHaveLength(1);
    expect(f.state().reversals).toHaveLength(2);
    expect(f.state().request.status).toBe("APPROVED");
    expect(
      first.snapshot.accountsAfter.find((a) => a.bucket === "N1")
        ?.committedDays,
    ).toBe(0);
    const rest = { ...input, restoredDays: 2 };
    const next = await f.service.preview(admin, "request", rest);
    await f.service.apply(
      admin,
      "request",
      rest,
      randomUUID(),
      next.fingerprint,
      null,
    );
    expect(f.state().accounts.every((a) => a.committedDays === 0)).toBe(true);
    await expect(
      f.service.preview(admin, "request", rest),
    ).rejects.toMatchObject({ code: "EXCESSIVE_RESTORATION" });
  });
  it("binds preview to payload and rejects key reuse with different data", async () => {
    const f = fixture();
    const p = await f.service.preview(admin, "request", input);
    const key = randomUUID();
    await expect(
      f.service.apply(
        admin,
        "request",
        { ...input, restoredDays: 4 },
        key,
        p.fingerprint,
        null,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await f.service.apply(admin, "request", input, key, p.fingerprint, null);
    await expect(
      f.service.apply(
        admin,
        "request",
        { ...input, reason: "Different" },
        key,
        p.fingerprint,
        null,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      f.service.apply(
        { ...admin, userId: "other-admin" },
        "request",
        input,
        key,
        p.fingerprint,
        null,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rolls back counters and ledger if record persistence fails", async () => {
    const f = fixture();
    const p = await f.service.preview(admin, "request", input);
    const before = structuredClone(f.state());
    f.fail();
    await expect(
      f.service.apply(
        admin,
        "request",
        input,
        randomUUID(),
        p.fingerprint,
        null,
      ),
    ).rejects.toThrow("forced persistence failure");
    expect(f.state()).toEqual(before);
    expect(f.returns()).toHaveLength(0);
  });
  it.each([0, -1, 0.5, 8, NaN, Infinity])(
    "rejects invalid or excessive days %s",
    async (restoredDays) => {
      const f = fixture();
      await expect(
        f.service.preview(admin, "request", { ...input, restoredDays }),
      ).rejects.toThrow();
      expect(f.state().reversals).toHaveLength(0);
    },
  );
  it("rejects missing or altered private evidence before any ledger mutation", async () => {
    const f = fixture();
    vi.mocked(f.storage.read).mockRejectedValueOnce(new Error("missing file"));
    await expect(
      f.service.preview(admin, "request", input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    vi.mocked(f.storage.read).mockResolvedValueOnce(new Uint8Array([9, 9, 9]));
    await expect(
      f.service.preview(admin, "request", input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.state().reversals).toHaveLength(0);
  });
  it("enforces Admin, genuine evidence, confirmation and year-boundary guard", async () => {
    const f = fixture();
    await expect(
      f.service.preview(owner, "request", input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.service.preview(admin, "request", {
        ...input,
        evidenceDocumentId: "foreign",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      f.service.preview(admin, "request", {
        ...input,
        unusedDaysConfirmed: false,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    f.setRollover();
    await expect(
      f.service.preview(admin, "request", input),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_POLICY" });
  });
});
describe("decision PDF and original-scan fidelity", () => {
  it("adds a status sheet while preserving source page size and source bytes", async () => {
    const scan = await PDFDocument.create();
    scan.addPage([400, 300]).setRotation(degrees(90));
    const bytes = await scan.save();
    const before = createHash("sha256").update(bytes).digest("hex");
    const result = await PDFDocument.load(
      await generateDecisionPdf("archive-1", snapshot, bytes),
    );
    expect(result.getTitle()).toBe("Arsip Final Cuti Disetujui");
    expect(result.getPageCount()).toBe(2);
    expect(result.getPage(1).getSize()).toEqual({ width: 400, height: 300 });
    expect(result.getPage(1).getRotation().angle).toBe(90);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(before);
  });
  it("makes a rejection notice without a scan and wraps long reasons", async () => {
    const result = await PDFDocument.load(
      await generateDecisionPdf("archive-2", {
        ...snapshot,
        status: "REJECTED",
        sourceDocumentVersion: null,
        reason: "Alasan penolakan é → telah dicatat. ".repeat(250),
      }),
    );
    expect(result.getTitle()).toBe("Hasil Penolakan Cuti");
    expect(result.getPageCount()).toBeGreaterThan(1);
  });
  it("denies other employees and catches altered source checksum before storing", async () => {
    const f = fixture();
    const archive: DecisionArchive = {
      id: "archive",
      leaveRequestId: "request",
      revisionId: "revision",
      transitionId: "transition",
      sourceDocumentId: "source",
      sourceStorageKey: "key",
      snapshot: { ...snapshot, sourceChecksumSha256: "f".repeat(64) },
      artifact: null,
    };
    vi.mocked(f.repository.decision).mockResolvedValue(archive);
    vi.mocked(f.storage.read).mockResolvedValue(new Uint8Array([1, 2, 3]));
    await expect(
      f.service.decisionDocument({ ...owner, employeeId: "other" }, "request"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.storage.read).not.toHaveBeenCalled();
    await expect(
      f.service.decisionDocument(owner, "request"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.storage.put).not.toHaveBeenCalled();
  });
});
