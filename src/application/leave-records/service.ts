import { createHash, randomUUID } from "node:crypto";
import { AnnualBalanceMutationService } from "@/application/leave-balance/service";
import {
  ANNUAL_BALANCE_BUCKET_PRIORITY,
  calculateRestorationOperations,
} from "@/domain/leave-balance";
import {
  assertReadable,
  requireNonEmpty,
  requireWorkflowAdmin,
  WorkflowError,
  type WorkflowActor,
} from "@/application/workflow/types";
import { generateDecisionPdf } from "./decision-pdf";
import type { DocumentStorage } from "@/application/ports/document-storage";
import type {
  LeaveRecordsDependencies,
  ReturnInput,
  ReturnState,
  ReturnTransaction,
} from "./ports";

export const RETURN_POLICY_VERSION = "BAL-002-ADMIN-MANUAL-2026-10-14";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function normalizeReturnInput(input: ReturnInput): ReturnInput {
  if (!Number.isSafeInteger(input.restoredDays) || input.restoredDays <= 0)
    throw new WorkflowError(
      "VALIDATION",
      "Hari pengembalian harus berupa bilangan bulat positif.",
    );
  if (input.unusedDaysConfirmed !== true)
    throw new WorkflowError(
      "VALIDATION",
      "Konfirmasi bahwa hari tidak digunakan sesuai dasar resmi.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.basisDate) ||
    Number.isNaN(Date.parse(input.basisDate)) ||
    new Date(input.basisDate).toISOString().slice(0, 10) !== input.basisDate
  )
    throw new WorkflowError("VALIDATION", "Tanggal dasar resmi tidak valid.");
  return {
    restoredDays: input.restoredDays,
    reason: requireNonEmpty(input.reason, "Alasan pengembalian", 10_000),
    basisReference: requireNonEmpty(
      input.basisReference,
      "Referensi dasar resmi",
    ),
    basisDate: input.basisDate,
    evidenceDocumentId: requireNonEmpty(input.evidenceDocumentId, "Bukti PDF"),
    unusedDaysConfirmed: true,
  };
}
function validateState(state: ReturnState) {
  if (
    state.request.status !== "APPROVED" ||
    state.request.currentRevision.leaveType !== "ANNUAL"
  )
    throw new WorkflowError(
      "ILLEGAL_TRANSITION",
      "Pengembalian hanya tersedia untuk Cuti Tahunan yang disetujui.",
    );
  if (state.hasDownstreamRollover)
    throw new WorkflowError(
      "UNSUPPORTED_POLICY",
      "Tahun saldo sudah memengaruhi rollover. Kasus ini memerlukan proses koreksi lanjutan.",
    );
  if (state.commits.length === 0)
    throw new WorkflowError("CONFLICT", "COMMIT asal tidak ditemukan.");
  const year = Number(state.request.currentRevision.startDate.slice(0, 4));
  if (
    state.commits.some(
      (o) =>
        o.employeeId !== state.request.employeeId ||
        o.entitlementYear !== year ||
        o.referenceType !== "LEAVE_REQUEST_REVISION" ||
        o.referenceId !== state.request.currentRevision.id,
    )
  )
    throw new WorkflowError(
      "CONFLICT",
      "Referensi COMMIT asal tidak konsisten.",
    );
}
function previewState(state: ReturnState, days: number) {
  validateState(state);
  if (
    state.accounts.length !== ANNUAL_BALANCE_BUCKET_PRIORITY.length ||
    state.accounts.some((a) => a.availableDays < 0 || a.committedDays < 0)
  )
    throw new WorkflowError(
      "CONFLICT",
      "Akun saldo belum lengkap atau tidak konsisten.",
    );
  const reversed = new Map<string, number>();
  for (const o of state.reversals) {
    const commit = state.commits.find((c) => c.id === o.compensatesOperationId);
    if (
      !commit ||
      o.bucket !== commit.bucket ||
      o.employeeId !== commit.employeeId ||
      o.entitlementYear !== commit.entitlementYear ||
      o.days <= 0
    )
      throw new WorkflowError(
        "CONFLICT",
        "Histori kompensasi tidak konsisten.",
      );
    reversed.set(commit.id, (reversed.get(commit.id) ?? 0) + o.days);
  }
  const commits = [...state.commits].sort(
    (a, b) =>
      ANNUAL_BALANCE_BUCKET_PRIORITY.indexOf(a.bucket) -
        ANNUAL_BALANCE_BUCKET_PRIORITY.indexOf(b.bucket) ||
      a.id.localeCompare(b.id),
  );
  const remaining = commits.map((o) => ({
    operationId: o.id,
    bucket: o.bucket,
    days: o.days - (reversed.get(o.id) ?? 0),
  }));
  if (remaining.some((o) => o.days < 0))
    throw new WorkflowError(
      "CONFLICT",
      "Pengembalian historis melebihi COMMIT asal.",
    );
  const originalCommittedDays = commits.reduce((n, o) => n + o.days, 0);
  const previouslyRestoredDays = [...reversed.values()].reduce(
    (n, v) => n + v,
    0,
  );
  const allocations = calculateRestorationOperations(
    remaining.filter((o) => o.days > 0),
    days,
  );
  const fingerprint = hash({
    revision: state.request.currentRevision.id,
    commits,
    reversals: [...state.reversals].sort((a, b) => a.id.localeCompare(b.id)),
    accounts: [...state.accounts].sort((a, b) =>
      a.bucket.localeCompare(b.bucket),
    ),
  });
  const accountsAfterPreview = state.accounts.map((a) => {
    const restored = allocations
      .filter((o) => o.bucket === a.bucket)
      .reduce((n, o) => n + o.days, 0);
    if (a.committedDays < restored)
      throw new WorkflowError(
        "CONFLICT",
        "Counter COMMIT tidak konsisten dengan ledger.",
      );
    return {
      ...a,
      committedDays: a.committedDays - restored,
      availableDays: a.availableDays + restored,
    };
  });
  if (
    accountsAfterPreview
      .filter((a) => a.bucket !== "JOINT_LEAVE_CLAIM")
      .reduce((n, a) => n + a.availableDays, 0) > 24
  )
    throw new WorkflowError(
      "CONFLICT",
      "Pengembalian melampaui batas saldo reguler; diperlukan pemeriksaan koreksi saldo.",
    );
  return {
    originalCommittedDays,
    previouslyRestoredDays,
    remainingCommittedDays: originalCommittedDays - previouslyRestoredDays,
    restoredDays: days,
    allocations,
    accountsBefore: state.accounts,
    accountsAfterPreview,
    fingerprint,
  };
}
async function checkedEvidence(
  tx: ReturnTransaction,
  input: ReturnInput,
  storage: DocumentStorage,
) {
  const e = await tx.evidence(input.evidenceDocumentId);
  if (
    !e ||
    e.leaveRequestId !== tx.state.request.id ||
    e.revisionId !== tx.state.request.currentRevision.id ||
    e.documentType !== "RETURN_BASIS"
  )
    throw new WorkflowError(
      "VALIDATION",
      "Bukti pengembalian tidak sesuai pengajuan atau revisi.",
    );
  let bytes: Uint8Array;
  try {
    bytes = await storage.read(e.storageKey);
  } catch {
    throw new WorkflowError(
      "CONFLICT",
      "Bukti PDF tidak tersedia di arsip privat.",
    );
  }
  if (createHash("sha256").update(bytes).digest("hex") !== e.checksum)
    throw new WorkflowError("CONFLICT", "Checksum bukti PDF tidak sesuai.");
  return e;
}
export class LeaveRecordsService {
  constructor(private readonly dependencies: LeaveRecordsDependencies) {}
  async verifyLegacyDecision(
    actor: WorkflowActor,
    requestId: string,
    documentId: string | null,
    confirmed: boolean,
  ) {
    requireWorkflowAdmin(actor);
    if (!confirmed)
      throw new WorkflowError(
        "VALIDATION",
        "Verifikasi dasar keputusan dan versi scan asli terlebih dahulu.",
      );
    await this.dependencies.repository.verifyLegacyDecision(
      requestId,
      documentId,
      actor.userId,
      actor.fullName,
      new Date(),
    );
    return this.decision(actor, requestId);
  }
  async decision(actor: WorkflowActor, requestId: string) {
    const record = await this.dependencies.repository.decision(requestId);
    if (!record) return null;
    // Caller also authenticates/authorizes the parent request. Never expose storage keys.
    assertReadable(actor, record.snapshot.employeeId);
    return {
      id: record.id,
      transitionId: record.transitionId,
      sourceDocumentId: record.sourceDocumentId,
      snapshot: record.snapshot,
      ready: record.artifact !== null,
    };
  }
  async decisionDocument(actor: WorkflowActor, requestId: string) {
    const { repository, storage } = this.dependencies;
    const record = await repository.decision(requestId);
    if (!record)
      throw new WorkflowError(
        "CONFLICT",
        "Arsip keputusan belum tersedia. Pengajuan lama memerlukan verifikasi versi sumber.",
      );
    assertReadable(actor, record.snapshot.employeeId);
    if (record.artifact) {
      const content = await storage.read(record.artifact.key);
      if (
        createHash("sha256").update(content).digest("hex") !==
        record.artifact.checksum
      )
        throw new WorkflowError(
          "CONFLICT",
          "Checksum arsip keputusan tidak sesuai.",
        );
      return { id: record.id, status: record.snapshot.status, content };
    }
    let source: Uint8Array | undefined;
    if (record.sourceStorageKey) {
      source = await storage.read(record.sourceStorageKey);
      if (
        createHash("sha256").update(source).digest("hex") !==
        record.snapshot.sourceChecksumSha256
      )
        throw new WorkflowError(
          "CONFLICT",
          "Checksum scan sumber tidak sesuai.",
        );
    } else if (record.snapshot.status === "APPROVED")
      throw new WorkflowError("CONFLICT", "Scan persetujuan tidak tersedia.");
    let content: Uint8Array;
    try {
      content = await generateDecisionPdf(record.id, record.snapshot, source);
    } catch {
      throw new WorkflowError(
        "VALIDATION",
        "PDF sumber tidak dapat diproses. File asli dan keputusan tetap tersimpan.",
      );
    }
    const stored = await storage.put(content);
    try {
      const artifact = await repository.createArtifact(record.id, stored);
      if (artifact.key !== stored.key) {
        await storage.delete(stored.key);
        return {
          id: record.id,
          status: record.snapshot.status,
          content: await storage.read(artifact.key),
        };
      }
    } catch (error) {
      await storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
    return { id: record.id, status: record.snapshot.status, content };
  }
  async preview(actor: WorkflowActor, requestId: string, raw: ReturnInput) {
    requireWorkflowAdmin(actor);
    const input = normalizeReturnInput(raw);
    return this.dependencies.repository.withReturnTransaction(
      requestId,
      async (tx) => {
        const evidence = await checkedEvidence(
          tx,
          input,
          this.dependencies.storage,
        );
        const preview = previewState(tx.state, input.restoredDays);
        return {
          ...preview,
          fingerprint: hash({
            state: preview.fingerprint,
            input,
            evidenceChecksum: evidence.checksum,
          }),
          input,
        };
      },
    );
  }
  async apply(
    actor: WorkflowActor,
    requestId: string,
    raw: ReturnInput,
    rawKey: string,
    fingerprint: string,
    sourceIp: string | null,
    now = new Date(),
  ) {
    requireWorkflowAdmin(actor);
    const input = normalizeReturnInput(raw);
    const key = requireNonEmpty(rawKey, "Idempotency key", 140);
    const payloadHash = hash({ input, requestId, actorUserId: actor.userId });
    return this.dependencies.repository.withReturnTransaction(
      requestId,
      async (tx) => {
        const replay = await tx.findRetry(key);
        if (replay) {
          if (
            replay.payloadHash !== payloadHash ||
            replay.leaveRequestId !== requestId ||
            replay.recordedByUserId !== actor.userId
          )
            throw new WorkflowError(
              "CONFLICT",
              "Idempotency key digunakan untuk data berbeda.",
            );
          return replay;
        }
        const evidence = await checkedEvidence(
          tx,
          input,
          this.dependencies.storage,
        );
        const preview = previewState(tx.state, input.restoredDays);
        if (
          hash({
            state: preview.fingerprint,
            input,
            evidenceChecksum: evidence.checksum,
          }) !== fingerprint
        )
          throw new WorkflowError(
            "CONFLICT",
            "Data, saldo atau histori berubah. Buat preview baru sebelum konfirmasi.",
          );
        const request = tx.state.request;
        const id = randomUUID();
        const entitlementYear = Number(
          request.currentRevision.startDate.slice(0, 4),
        );
        const result = await new AnnualBalanceMutationService(
          tx.annualBalanceRepository,
        ).reverseCommittedAnnualLeave({
          employeeId: request.employeeId,
          entitlementYear,
          reference: {
            referenceType: "LEAVE_REQUEST_REVISION",
            referenceId: request.currentRevision.id,
          },
          idempotencyKey: "leave-return:" + id,
          restoreDays: input.restoredDays,
          reason: input.reason,
          occurredAt: now,
        });
        const accountsAfter = await tx.freshAccounts();
        const actual = result.operations.map((o) => ({
          bucket: o.bucket,
          days: o.days,
          compensatesOperationId: o.compensatesOperationId!,
        }));
        if (
          hash(
            actual.map((o) => [o.bucket, o.days, o.compensatesOperationId]),
          ) !==
          hash(
            preview.allocations.map((o) => [
              o.bucket,
              o.days,
              o.compensatesOperationId,
            ]),
          )
        )
          throw new WorkflowError(
            "CONFLICT",
            "Alokasi aktual berbeda dari preview.",
          );
        return tx.create(
          {
            id,
            leaveRequestId: requestId,
            revisionId: request.currentRevision.id,
            entitlementYear,
            restoredDays: input.restoredDays,
            reason: input.reason,
            basisReference: input.basisReference,
            basisDate: input.basisDate,
            evidenceDocumentId: input.evidenceDocumentId,
            recordedByUserId: actor.userId,
            recordedAt: now,
            sourceIp,
            idempotencyKey: key,
            payloadHash,
            policyVersion: RETURN_POLICY_VERSION,
            snapshot: {
              unusedDaysConfirmed: true,
              evidenceChecksum: evidence.checksum,
              originalCommittedDays: preview.originalCommittedDays,
              previouslyRestoredDays: preview.previouslyRestoredDays,
              allocations: actual,
              accountsBefore: tx.state.accounts,
              accountsAfter,
            },
          },
          result.operations,
        );
      },
    );
  }
  async returns(
    actor: WorkflowActor,
    request: import("@/application/workflow/ports").LeaveRequestRecord,
  ) {
    assertReadable(actor, request.employeeId);
    return this.dependencies.repository.returns(request.id);
  }
}
