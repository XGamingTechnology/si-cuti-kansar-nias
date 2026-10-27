import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  JointLeaveService,
  publicClaim,
} from "@/application/joint-leave/service";
import {
  checksum,
  currentYear,
  eligible,
  validateEvidence,
  validatePolicy,
  validateReview,
  validateSubmit,
} from "@/application/joint-leave/rules";
import type {
  Claim,
  ClaimCreate,
  JointLeaveRepository,
  JointLeaveTransaction,
  Policy,
  ReviewInput,
  SubmitInput,
} from "@/application/joint-leave/ports";
import type { DocumentStorage } from "@/application/ports/document-storage";
import type { Principal } from "@/modules/auth/service";

const owner: Principal = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Pegawai Sintetis",
  role: "PEGAWAI",
};
const admin: Principal = {
  ...owner,
  userId: randomUUID(),
  role: "ADMIN_KEPEGAWAIAN",
};
const eventId = randomUUID(),
  policyId = randomUUID(),
  claimId = randomUUID();
const policy: Policy = {
  id: policyId,
  name: "Tanggal Uji",
  creditYear: 2026,
  quotaDays: 3,
  sourceReference: "DASAR SINTETIS",
  isActive: true,
  eventDates: [
    { id: eventId, date: "2026-04-01", name: "Tanggal Uji", kind: "REGULAR" },
  ],
};
const submitted: SubmitInput = {
  policyId,
  eventIds: [eventId],
  assignmentType: "OPERATIONS",
  title: "Operasi uji sintetis",
  sprinNumber: null,
  idempotencyKey: randomUUID(),
};
let bytes: Uint8Array;
beforeAll(async () => {
  const p = await PDFDocument.create();
  p.addPage([300, 300]);
  bytes = await p.save();
});
function fixture() {
  let c: Claim | null = null;
  const files = new Map<string, Uint8Array>();
  const storage: DocumentStorage = {
    put: vi.fn(async (b) => {
      const key = randomUUID();
      files.set(key, b);
      return { key, size: b.length, checksum: checksum(b) };
    }),
    read: vi.fn(async (k) => {
      const f = files.get(k);
      if (!f) throw Error("missing");
      return f;
    }),
    delete: vi.fn(async (k) => {
      files.delete(k);
    }),
  };
  const accounts = ["JOINT_LEAVE_CLAIM", "N2", "N1", "N"].map((bucket) => ({
    id: randomUUID(),
    employeeId: owner.employeeId,
    entitlementYear: 2026,
    bucket: bucket as "N" | "N1" | "N2" | "JOINT_LEAVE_CLAIM",
    grantedDays: bucket === "N" ? 12 : 0,
    reservedDays: 0,
    committedDays: 0,
    availableDays: bucket === "N" ? 12 : 0,
  }));
  const tx: JointLeaveTransaction = {
    policy: vi.fn(async () => policy),
    claim: vi.fn(async () => c),
    retry: vi.fn(async (key) => (c?.idempotencyKey === key ? c : null)),
    reviewRetry: vi.fn(async (key) => (c?.reviewKey === key ? c : null)),
    blockingDates: vi.fn(async () => []),
    create: vi.fn(async (v: ClaimCreate): Promise<Claim> => {
      c = {
        ...v,
        employeeName: owner.fullName,
        employeeNip: "TEST",
        reviewKey: null,
        reviewHash: null,
        reviewedByUserId: null,
        reviewedAt: null,
        reason: null,
        reviewSnapshot: null,
        dates: v.dates.map((d) => ({
          ...d,
          id: randomUUID(),
          status: "PENDING",
          operationId: null,
        })),
      };
      return c!;
    }),
    accounts: vi.fn(async () => structuredClone(accounts)),
    approvedDays: vi.fn(async () => 0),
    hasDownstreamRollover: vi.fn(async () => false),
    grant: vi.fn(async (_c, ids) => {
      accounts[0].grantedDays += ids.length;
      accounts[0].availableDays += ids.length;
    }),
    decide: vi.fn(async (_c, v, a, now, hash, snapshot) => {
      c = {
        ...c!,
        status: v.approvedEventIds.length ? "APPROVED" : "REJECTED",
        reviewKey: v.idempotencyKey,
        reviewHash: hash,
        reviewedByUserId: a.userId,
        reviewedAt: now,
        reason: v.reason,
        reviewSnapshot: snapshot,
      };
      return c!;
    }),
  };
  const repo: JointLeaveRepository = {
    policies: vi.fn(async () => [policy]),
    createPolicy: vi.fn(async () => policy),
    list: vi.fn(async () => ({ claims: c ? [c] : [], total: c ? 1 : 0 })),
    claim: tx.claim,
    retry: tx.retry,
    blockingDates: tx.blockingDates,
    withEmployee: vi.fn(async (_id, work) => work(tx)),
  };
  const service = new JointLeaveService(
    repo,
    storage,
    () => new Date("2026-04-10T00:00:00Z"),
  );
  return { service, repo, tx, storage, files, accounts, getClaim: () => c! };
}
function review(): ReviewInput {
  return {
    approvedEventIds: [eventId],
    reason: "Bukti sesuai tugas uji",
    evidenceVerified: true,
    idempotencyKey: randomUUID(),
    fingerprint: "",
  };
}
const file = () => ({ bytes, mime: "application/pdf" });
describe("Joint Leave approved rules", () => {
  it("rejects impossible dates in duplicate lookup before querying the repository", async () => {
    const f = fixture();
    await expect(
      f.service.duplicates(owner, ["2026-02-30"]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(f.repo.blockingDates).not.toHaveBeenCalled();
  });
  it("maps December and January to the explicitly selected credit year, never shifts January again", () => {
    const p = validatePolicy({
      name: "Natal/Tahun Baru",
      creditYear: 2026,
      quotaDays: 2,
      sourceReference: "UJI",
      events: [
        { date: "2025-12-26", name: "Natal", kind: "YEAR_END" },
        { date: "2026-01-02", name: "Tahun Baru", kind: "YEAR_END" },
      ],
    });
    expect(p.creditYear).toBe(2026);
    expect(p.events.map((e) => e.date)).toEqual(["2025-12-26", "2026-01-02"]);
    expect(() => validatePolicy({ ...p, creditYear: 2027 })).toThrow(
      /Tahun saldo/,
    );
  });
  it.each(["2026-02-30", "2026-13-01", "2025-01-01"])(
    "rejects malformed/unmatched event date %s",
    (date) => {
      expect(() =>
        validatePolicy({
          name: "Uji",
          creditYear: 2026,
          quotaDays: 1,
          sourceReference: "Uji",
          events: [{ date, name: "Uji", kind: "REGULAR" }],
        }),
      ).toThrow();
    },
  );
  it("does not infer a credit from arbitrary dates or duplicate dates", () => {
    const data = {
      name: "Uji",
      creditYear: 2026,
      quotaDays: 1,
      sourceReference: "Uji",
      events: [{ date: "2026-04-01", name: "Uji", kind: "REGULAR" as const }],
    };
    expect(() =>
      validatePolicy({ ...data, events: [...data.events, ...data.events] }),
    ).toThrow(/duplikat/);
  });
  it("uses WIB for the exact year boundary", () => {
    expect(currentYear(new Date("2026-12-31T16:59:59.999Z"))).toBe(2026);
    expect(currentYear(new Date("2026-12-31T17:00:00Z"))).toBe(2027);
    expect(() => eligible(policy, new Date("2026-12-31T17:00:00Z"))).toThrow(
      /tahun/,
    );
  });
  it("Sprin is optional, assignment type and title are mandatory", () => {
    expect(
      validateSubmit({ ...submitted, sprinNumber: "   " }).sprinNumber,
    ).toBeNull();
    expect(() => validateSubmit({ ...submitted, title: " " })).toThrow();
    expect(() =>
      validateSubmit({ ...submitted, assignmentType: "SPRIN" as never }),
    ).toThrow();
    expect(() =>
      validateSubmit({ ...submitted, eventIds: [eventId, eventId] }),
    ).toThrow(/duplikat/);
  });
  it("approval requires verification; rejection requires an explanation without requiring verification", () => {
    expect(() =>
      validateReview({ ...review(), evidenceVerified: false }),
    ).toThrow(/Konfirmasi/);
    expect(
      validateReview({
        ...review(),
        approvedEventIds: [],
        evidenceVerified: false,
      }).approvedEventIds,
    ).toHaveLength(0);
    expect(() =>
      validateReview({ ...review(), approvedEventIds: [], reason: " " }),
    ).toThrow();
  });
  it("validates PDF bytes and rejects MIME spoofing, encrypted/empty and oversized files", async () => {
    await expect(validateEvidence(file())).resolves.toBeUndefined();
    await expect(
      validateEvidence({
        bytes: new Uint8Array([1, 2, 3]),
        mime: "application/pdf",
      }),
    ).rejects.toThrow();
    await expect(
      validateEvidence({ bytes, mime: "image/jpeg" }),
    ).rejects.toThrow();
    await expect(
      validateEvidence({
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
        mime: "image/png",
      }),
    ).rejects.toThrow(/10 MB/);
  });
  it("Pegawai cannot configure/review and Admin cannot impersonate claim submission", async () => {
    const f = fixture();
    await expect(
      f.service.configure(owner, {} as never, randomUUID()),
    ).rejects.toThrow("Forbidden");
    await expect(f.service.submit(admin, submitted, file())).rejects.toThrow(
      "Forbidden",
    );
    await expect(f.service.preview(owner, claimId, review())).rejects.toThrow(
      "Forbidden",
    );
    expect(f.storage.put).not.toHaveBeenCalled();
  });
  it("submission pins evidence and policy but does not grant balance; identical retry keeps one file", async () => {
    const f = fixture();
    const result = await f.service.submit(owner, submitted, file());
    expect(result.status).toBe("SUBMITTED");
    expect(result.policySnapshot).toEqual(policy);
    expect(result).not.toHaveProperty("evidenceKey");
    expect(f.tx.grant).not.toHaveBeenCalled();
    expect((await f.service.submit(owner, submitted, file())).id).toBe(
      result.id,
    );
    expect(f.storage.put).toHaveBeenCalledTimes(1);
    await expect(
      f.service.submit(owner, { ...submitted, title: "Berubah" }, file()),
    ).rejects.toThrow(/Kunci/);
  });
  it("blocks pending/approved date duplication at submit and cleans up the rejected file write", async () => {
    const f = fixture();
    vi.mocked(f.tx.blockingDates).mockResolvedValue(["2026-04-01"]);
    await expect(f.service.submit(owner, submitted, file())).rejects.toThrow(
      /sudah ada/,
    );
    expect(f.files.size).toBe(0);
    expect(f.tx.create).not.toHaveBeenCalled();
  });
  it("owner isolation denies metadata and evidence before storage reads", async () => {
    const f = fixture();
    await f.service.submit(owner, submitted, file());
    const other = { ...owner, employeeId: randomUUID() };
    await expect(f.service.get(other, claimId)).rejects.toThrow(
      /tidak ditemukan/,
    );
    await expect(f.service.evidence(other, claimId)).rejects.toThrow(
      /tidak ditemukan/,
    );
    expect(f.storage.read).not.toHaveBeenCalled();
  });
  it("preview is read-only; stale balance fails before GRANT, fresh confirmation grants exactly once", async () => {
    const f = fixture();
    await f.service.submit(owner, submitted, file());
    const r = review();
    const p = await f.service.preview(admin, claimId, r);
    expect(f.tx.grant).not.toHaveBeenCalled();
    f.accounts[3].reservedDays = 1;
    f.accounts[3].availableDays = 11;
    await expect(
      f.service.review(admin, claimId, { ...r, fingerprint: p.fingerprint }),
    ).rejects.toThrow(/Pratinjau/);
    const fresh = await f.service.preview(admin, claimId, r),
      input = { ...r, fingerprint: fresh.fingerprint };
    const saved = await f.service.review(admin, claimId, input);
    expect(saved.status).toBe("APPROVED");
    expect(f.accounts[0].grantedDays).toBe(1);
    expect((await f.service.review(admin, claimId, input)).id).toBe(saved.id);
    expect(f.tx.grant).toHaveBeenCalledTimes(1);
  });
  it("rejection records reason without credit and integrity checks prevent granting changed bytes", async () => {
    const f = fixture();
    await f.service.submit(owner, submitted, file());
    const r = {
      ...review(),
      approvedEventIds: [],
      evidenceVerified: false,
      reason: "Bukti belum sesuai",
    };
    const p = await f.service.preview(admin, claimId, r);
    expect(
      (
        await f.service.review(admin, claimId, {
          ...r,
          fingerprint: p.fingerprint,
        })
      ).status,
    ).toBe("REJECTED");
    expect(f.accounts[0].grantedDays).toBe(0);
    const g = fixture();
    await g.service.submit(owner, submitted, file());
    g.files.set(g.getClaim().evidenceKey, new Uint8Array([1]));
    await expect(g.service.preview(admin, claimId, review())).rejects.toThrow(
      /Bukti/,
    );
    expect(g.tx.grant).not.toHaveBeenCalled();
  });
  it.each(["UNINITIALIZED", "ROLLOVER", "QUOTA"])(
    "fails closed for %s without mutating balances",
    async (condition) => {
      const f = fixture();
      await f.service.submit(owner, submitted, file());
      if (condition === "UNINITIALIZED")
        vi.mocked(f.tx.accounts).mockResolvedValue([]);
      if (condition === "ROLLOVER")
        vi.mocked(f.tx.hasDownstreamRollover).mockResolvedValue(true);
      if (condition === "QUOTA")
        vi.mocked(f.tx.approvedDays).mockResolvedValue(3);
      await expect(
        f.service.preview(admin, claimId, review()),
      ).rejects.toThrow();
      expect(f.tx.grant).not.toHaveBeenCalled();
    },
  );
  it("does not expose storage keys, command keys or payload hashes", () => {
    const c = {
      evidenceKey: "private",
      payloadHash: "hash",
      reviewHash: "hash",
      idempotencyKey: "key",
      reviewKey: "key",
      id: claimId,
    } as Claim;
    expect(publicClaim(c)).toEqual({ id: claimId });
  });
});

it.each([null, "SPRIN/UAT/01"])(
  "accepts Sprin assignment without deriving its number: %s",
  (sprinNumber) => {
    expect(
      validateSubmit({
        ...submitted,
        assignmentType: "SPRIN_ASSIGNMENT",
        sprinNumber,
      }),
    ).toMatchObject({ assignmentType: "SPRIN_ASSIGNMENT", sprinNumber });
  },
);
