import { countWorkingDays } from "@/domain/leave-balance";
import type { TransitionRecord, WorkflowRepository } from "./ports";
import {
  assertReadable,
  requireNonEmpty,
  requireOwner,
  requireWorkflowAdmin,
  WorkflowError,
  type PermissionRevisionContent,
  type WorkflowActor,
  type WorkflowStatus,
} from "./types";

function validateContent(content: PermissionRevisionContent) {
  // Reuse strict business-date/range parsing without inferring a duration rule.
  countWorkingDays({ startDate: content.startDate, endDate: content.endDate });
  requireNonEmpty(content.permissionTypeId, "Jenis izin");
  requireNonEmpty(content.reason, "Alasan", 10_000);
}

function retryMatches(
  value: TransitionRecord,
  input: Omit<TransitionRecord, "id" | "occurredAt">,
) {
  return (
    value.requestId === input.requestId &&
    value.toStatus === input.toStatus &&
    value.actorUserId === input.actorUserId &&
    value.reason === input.reason &&
    value.evidenceReference === input.evidenceReference
  );
}

export class PermissionWorkflowService {
  constructor(private readonly repository: WorkflowRepository) {}

  async createDraft(actor: WorkflowActor, content: PermissionRevisionContent) {
    if (actor.role !== "PEGAWAI")
      throw new WorkflowError("FORBIDDEN", "Forbidden");
    validateContent(content);
    if (
      !(await this.repository.permissionTypeIsActive(content.permissionTypeId))
    )
      throw new WorkflowError("VALIDATION", "Jenis izin tidak aktif.");
    return this.repository.createPermissionDraft(actor.employeeId, {
      ...content,
      reason: content.reason.trim(),
    });
  }

  async updateDraft(
    actor: WorkflowActor,
    requestId: string,
    content: PermissionRevisionContent,
  ) {
    validateContent(content);
    const request = await this.get(actor, requestId);
    requireOwner(actor, request.employeeId);
    if (
      !["DRAFT", "RETURNED_FOR_CORRECTION"].includes(request.status) ||
      request.currentRevision.submittedAt
    )
      throw new WorkflowError(
        "ILLEGAL_TRANSITION",
        "Revisi yang sudah diajukan tidak dapat diubah.",
      );
    if (
      !(await this.repository.permissionTypeIsActive(content.permissionTypeId))
    )
      throw new WorkflowError("VALIDATION", "Jenis izin tidak aktif.");
    return this.repository.updatePermissionRevision(
      requestId,
      request.currentRevision.id,
      { ...content, reason: content.reason.trim() },
    );
  }

  async get(actor: WorkflowActor, id: string) {
    const request = await this.repository.getPermission(id);
    if (!request)
      throw new WorkflowError("NOT_FOUND", "Pengajuan izin tidak ditemukan.");
    assertReadable(actor, request.employeeId);
    return request;
  }
  async revisions(actor: WorkflowActor, id: string) {
    await this.get(actor, id);
    return this.repository.listPermissionRevisions(id);
  }
  async history(actor: WorkflowActor, id: string) {
    await this.get(actor, id);
    return this.repository.listPermissionTransitions(id);
  }

  submit(actor: WorkflowActor, id: string, key: string, now = new Date()) {
    return this.transition(actor, id, "SUBMITTED", key, null, null, now);
  }
  returnForCorrection(
    actor: WorkflowActor,
    id: string,
    reason: string,
    key: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      id,
      "RETURNED_FOR_CORRECTION",
      key,
      requireNonEmpty(reason, "Alasan pengembalian", 10_000),
      null,
      now,
    );
  }
  reject(
    actor: WorkflowActor,
    id: string,
    reason: string,
    key: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      id,
      "REJECTED",
      key,
      requireNonEmpty(reason, "Alasan penolakan", 10_000),
      null,
      now,
    );
  }
  approve(
    actor: WorkflowActor,
    id: string,
    evidence: string,
    key: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      id,
      "APPROVED",
      key,
      null,
      requireNonEmpty(evidence, "Referensi bukti"),
      now,
    );
  }
  cancel(actor: WorkflowActor, id: string, key: string, now = new Date()) {
    return this.transition(actor, id, "CANCELLED", key, null, null, now);
  }

  private transition(
    actor: WorkflowActor,
    requestId: string,
    target: WorkflowStatus,
    rawKey: string,
    reason: string | null,
    evidenceReference: string | null,
    now: Date,
  ) {
    const idempotencyKey = requireNonEmpty(rawKey, "Idempotency key");
    return this.repository.transaction(async (tx) => {
      const request = await tx.lockPermissionRequest(requestId);
      if (!request)
        throw new WorkflowError("NOT_FOUND", "Pengajuan izin tidak ditemukan.");
      const expected = {
        requestId,
        revisionId: request.currentRevision.id,
        fromStatus: target === "SUBMITTED" ? request.status : "SUBMITTED",
        toStatus: target,
        actorUserId: actor.userId,
        reason,
        evidenceReference,
        idempotencyKey,
      } as const;
      const retry = await tx.findPermissionTransitionByKey(idempotencyKey);
      if (retry) {
        if (
          !retryMatches(retry, expected) ||
          (target === "SUBMITTED" &&
            retry.revisionId !== request.currentRevision.id) ||
          (target === "RETURNED_FOR_CORRECTION" &&
            request.status === "SUBMITTED")
        )
          throw new WorkflowError(
            "CONFLICT",
            "Idempotency key telah digunakan untuk operasi berbeda.",
          );
        return retry;
      }
      if (target === "SUBMITTED") {
        requireOwner(actor, request.employeeId);
        if (!["DRAFT", "RETURNED_FOR_CORRECTION"].includes(request.status))
          throw new WorkflowError(
            "ILLEGAL_TRANSITION",
            "Pengajuan tidak dapat diajukan dari status saat ini.",
          );
        if (
          !(await tx.permissionTypeIsActive(
            request.currentRevision.permissionTypeId,
          ))
        )
          throw new WorkflowError("VALIDATION", "Jenis izin tidak aktif.");
      } else if (target === "CANCELLED") {
        requireOwner(actor, request.employeeId);
        if (
          !["DRAFT", "SUBMITTED", "RETURNED_FOR_CORRECTION"].includes(
            request.status,
          )
        )
          throw new WorkflowError(
            "ILLEGAL_TRANSITION",
            "Pengajuan final tidak dapat dibatalkan.",
          );
      } else {
        requireWorkflowAdmin(actor);
        if (request.status !== "SUBMITTED")
          throw new WorkflowError(
            "ILLEGAL_TRANSITION",
            "Admin hanya dapat memutus pengajuan SUBMITTED.",
          );
      }
      if (
        target === "RETURNED_FOR_CORRECTION" &&
        !(await tx.permissionTypeIsActive(
          request.currentRevision.permissionTypeId,
        ))
      )
        throw new WorkflowError(
          "VALIDATION",
          "Jenis izin tidak aktif dan tidak dapat digunakan pada revisi baru.",
        );
      if (target === "SUBMITTED")
        await tx.submitPermissionRevision(request.currentRevision.id, now);
      await tx.setPermissionStatus(requestId, target);
      const transition = await tx.appendPermissionTransition({
        ...expected,
        occurredAt: now,
      });
      if (target === "RETURNED_FOR_CORRECTION")
        await tx.createPermissionCorrection(request);
      return transition;
    });
  }
}
