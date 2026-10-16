import { randomUUID } from "node:crypto";
import type { Principal } from "@/modules/auth/service";
import { requireAdmin, requireRole } from "@/application/authorization/policy";
import type { DocumentStorage } from "@/application/ports/document-storage";
import { annualBalanceReadiness } from "@/application/leave-balance/administration";
import type {
  Claim,
  ClaimQuery,
  EvidenceInput,
  JointLeaveRepository,
  JointLeaveTransaction,
  PolicyInput,
  ReviewInput,
  SubmitInput,
} from "./ports";
import {
  checksum,
  currentYear,
  digest,
  eligible,
  JointLeaveError,
  uuid,
  validateEvidence,
  validatePolicy,
  validateReview,
  validateSubmit,
  year,
} from "./rules";

export function publicClaim(
  c: Claim,
): Omit<
  Claim,
  "evidenceKey" | "payloadHash" | "reviewHash" | "idempotencyKey" | "reviewKey"
> {
  const allowed = [
    "id",
    "employeeId",
    "employeeName",
    "employeeNip",
    "policyId",
    "creditYear",
    "policySnapshot",
    "assignmentType",
    "title",
    "sprinNumber",
    "status",
    "submittedByUserId",
    "submittedAt",
    "evidenceChecksum",
    "evidenceSize",
    "evidenceMime",
    "reviewedByUserId",
    "reviewedAt",
    "reason",
    "reviewSnapshot",
    "dates",
  ] as const;
  return Object.fromEntries(
    allowed.filter((k) => k in c).map((k) => [k, c[k]]),
  ) as Omit<
    Claim,
    | "evidenceKey"
    | "payloadHash"
    | "reviewHash"
    | "idempotencyKey"
    | "reviewKey"
  >;
}
export class JointLeaveService {
  constructor(
    private readonly repository: JointLeaveRepository,
    private readonly storage: DocumentStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  policies(_actor: Principal, value: number) {
    return this.repository.policies(year(value));
  }
  async configure(actor: Principal, input: PolicyInput, key: string) {
    requireAdmin(actor);
    const value = validatePolicy(input);
    return this.repository.createPolicy(value, actor, uuid(key), digest(value));
  }
  async list(actor: Principal, q: ClaimQuery) {
    year(q.year);
    if (
      !Number.isSafeInteger(q.page) ||
      q.page < 1 ||
      q.page > 100000 ||
      q.search.length > 200 ||
      (q.status && !["SUBMITTED", "APPROVED", "REJECTED"].includes(q.status))
    )
      throw new JointLeaveError("VALIDATION", "Filter klaim tidak valid.");
    const result = await this.repository.list(actor, q);
    return { ...result, claims: result.claims.map(publicClaim) };
  }
  private accessible(actor: Principal, claim: Claim | null): Claim {
    if (
      !claim ||
      (actor.role !== "ADMIN_KEPEGAWAIAN" &&
        claim.employeeId !== actor.employeeId)
    )
      throw new JointLeaveError("NOT_FOUND", "Klaim tidak ditemukan.");
    return claim;
  }
  async get(actor: Principal, id: string) {
    return publicClaim(
      this.accessible(actor, await this.repository.claim(uuid(id))),
    );
  }
  async duplicates(actor: Principal, dates: string[]) {
    requireRole(actor, "PEGAWAI");
    if (
      dates.length > 366 ||
      dates.some(
        (d) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          !Number.isFinite(Date.parse(d + "T00:00:00Z")) ||
          new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d,
      )
    )
      throw new JointLeaveError("VALIDATION", "Daftar tanggal tidak valid.");
    return this.repository.blockingDates(actor.employeeId, dates);
  }
  async evidence(actor: Principal, id: string) {
    const c = this.accessible(actor, await this.repository.claim(uuid(id)));
    const bytes = await this.storage.read(c.evidenceKey);
    if (
      checksum(bytes) !== c.evidenceChecksum ||
      bytes.length !== c.evidenceSize
    )
      throw new JointLeaveError(
        "CONFLICT",
        "Integritas bukti tidak sesuai arsip.",
      );
    return { bytes, mime: c.evidenceMime };
  }
  private replay(c: Claim, actor: Principal, hash: string) {
    if (c.submittedByUserId !== actor.userId || c.payloadHash !== hash)
      throw new JointLeaveError(
        "CONFLICT",
        "Kunci pengajuan telah digunakan untuk data berbeda.",
      );
    return c;
  }
  async submit(actor: Principal, input: SubmitInput, file: EvidenceInput) {
    requireRole(actor, "PEGAWAI");
    const value = validateSubmit(input);
    await validateEvidence(file);
    const evidenceChecksum = checksum(file.bytes),
      hash = digest({
        value,
        actor: actor.userId,
        evidenceChecksum,
        mime: file.mime,
      });
    const existing = await this.repository.retry(value.idempotencyKey);
    if (existing) return publicClaim(this.replay(existing, actor, hash));
    const stored = await this.storage.put(file.bytes);
    let keep = false;
    try {
      const c = await this.repository.withEmployee(
        actor.employeeId,
        async (tx) => {
          const retry = await tx.retry(value.idempotencyKey);
          if (retry) return this.replay(retry, actor, hash);
          const policy = await tx.policy(value.policyId);
          if (!policy)
            throw new JointLeaveError(
              "NOT_FOUND",
              "Pengaturan tanggal tidak ditemukan.",
            );
          const now = this.clock();
          eligible(policy, now);
          const events = value.eventIds.map((id) =>
            policy.eventDates.find((e) => e.id === id),
          );
          if (events.some((e) => !e))
            throw new JointLeaveError(
              "VALIDATION",
              "Tanggal tidak termasuk pengaturan yang dipilih.",
            );
          const dates = events.map((e) => ({
            eventId: e!.id,
            eventDate: e!.date,
          }));
          if (
            (
              await tx.blockingDates(
                actor.employeeId,
                dates.map((d) => d.eventDate),
              )
            ).length
          )
            throw new JointLeaveError(
              "CONFLICT",
              "Tanggal ini sudah ada pada klaim Anda yang sedang diperiksa atau sudah disetujui.",
            );
          const created = await tx.create({
            id: randomUUID(),
            employeeId: actor.employeeId,
            policyId: policy.id,
            creditYear: policy.creditYear,
            policySnapshot: policy,
            assignmentType: value.assignmentType,
            title: value.title,
            sprinNumber: value.sprinNumber,
            status: "SUBMITTED",
            submittedByUserId: actor.userId,
            submittedAt: now,
            idempotencyKey: value.idempotencyKey,
            payloadHash: hash,
            evidenceKey: stored.key,
            evidenceChecksum: stored.checksum,
            evidenceSize: stored.size,
            evidenceMime: file.mime,
            dates,
          });
          keep = true;
          return created;
        },
      );
      return publicClaim(c);
    } catch (error) {
      keep = false;
      throw error;
    } finally {
      if (!keep) await this.storage.delete(stored.key);
    }
  }
  private async previewState(
    tx: JointLeaveTransaction,
    c: Claim,
    value: ReviewInput,
    actor: Principal,
  ) {
    if (c.status !== "SUBMITTED")
      throw new JointLeaveError(
        "CONFLICT",
        "Klaim sudah diputuskan. Muat ulang riwayat.",
      );
    if (
      value.approvedEventIds.some(
        (id) => !c.dates.some((d) => d.eventId === id),
      )
    )
      throw new JointLeaveError(
        "VALIDATION",
        "Tanggal persetujuan bukan bagian klaim.",
      );
    const bytes = await this.storage.read(c.evidenceKey);
    if (
      checksum(bytes) !== c.evidenceChecksum ||
      bytes.length !== c.evidenceSize
    )
      throw new JointLeaveError(
        "CONFLICT",
        "Bukti berubah atau tidak sesuai checksum.",
      );
    const accounts = await tx.accounts(c.employeeId, c.creditYear);
    const previouslyApproved = await tx.approvedDays(
      c.employeeId,
      c.creditYear,
    );
    if (value.approvedEventIds.length) {
      if (c.creditYear !== currentYear(this.clock()))
        throw new JointLeaveError(
          "UNSUPPORTED",
          "Tahun saldo klaim telah berakhir atau belum berlaku; tidak ada kredit otomatis lintas tahun.",
        );
      if (annualBalanceReadiness(accounts) !== "INITIALIZED")
        throw new JointLeaveError(
          "UNSUPPORTED",
          "Saldo tahun tujuan belum siap. Admin perlu menyiapkan saldo awal terlebih dahulu.",
        );
      if (await tx.hasDownstreamRollover(c.employeeId, c.creditYear))
        throw new JointLeaveError(
          "UNSUPPORTED",
          "Tahun saldo sudah menjadi dasar rollover; perlu pemeriksaan koreksi terpisah.",
        );
      if (
        previouslyApproved + value.approvedEventIds.length >
        c.policySnapshot.quotaDays
      )
        throw new JointLeaveError(
          "CONFLICT",
          "Total hari yang disetujui melampaui batas tahunan pada pengaturan klaim ini.",
        );
    }
    const snapshot = {
      accountsBefore: accounts,
      previouslyApproved,
      approvedDays: value.approvedEventIds.length,
      creditYear: c.creditYear,
      evidenceChecksum: c.evidenceChecksum,
    };
    const fingerprint = digest({
      snapshot,
      claimId: c.id,
      actor: actor.userId,
      approvedEventIds: value.approvedEventIds,
      reason: value.reason,
      evidenceVerified: value.evidenceVerified,
    });
    return { ...snapshot, fingerprint };
  }
  async preview(actor: Principal, id: string, input: ReviewInput) {
    requireAdmin(actor);
    const claim = this.accessible(actor, await this.repository.claim(uuid(id))),
      value = validateReview(input);
    return this.repository.withEmployee(claim.employeeId, async (tx) =>
      this.previewState(
        tx,
        this.accessible(actor, await tx.claim(claim.id)),
        value,
        actor,
      ),
    );
  }
  async review(actor: Principal, id: string, input: ReviewInput) {
    requireAdmin(actor);
    const original = this.accessible(
        actor,
        await this.repository.claim(uuid(id)),
      ),
      value = validateReview(input);
    const hash = digest({
      claimId: original.id,
      actor: actor.userId,
      approvedEventIds: value.approvedEventIds,
      reason: value.reason,
      evidenceVerified: value.evidenceVerified,
      fingerprint: value.fingerprint,
    });
    const result = await this.repository.withEmployee(
      original.employeeId,
      async (tx) => {
        const retry = await tx.reviewRetry(value.idempotencyKey);
        if (retry) {
          if (
            retry.id !== original.id ||
            retry.reviewedByUserId !== actor.userId ||
            retry.reviewHash !== hash
          )
            throw new JointLeaveError(
              "CONFLICT",
              "Kunci pemeriksaan telah digunakan untuk data berbeda.",
            );
          return retry;
        }
        const c = this.accessible(actor, await tx.claim(original.id)),
          preview = await this.previewState(tx, c, value, actor);
        if (!value.fingerprint || value.fingerprint !== preview.fingerprint)
          throw new JointLeaveError(
            "CONFLICT",
            "Pratinjau berubah. Periksa dan konfirmasi ulang.",
          );
        const now = this.clock();
        await tx.grant(c, value.approvedEventIds, now, value.reason);
        const accountsAfter = await tx.accounts(c.employeeId, c.creditYear);
        return tx.decide(c, value, actor, now, hash, {
          ...preview,
          accountsAfter,
          evidenceVerified: value.evidenceVerified,
        });
      },
    );
    return publicClaim(result);
  }
}
