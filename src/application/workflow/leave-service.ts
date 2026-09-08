import { AnnualBalanceMutationService } from "@/application/leave-balance/service";
import { countWorkingDays } from "@/domain/leave-balance";
import type { WorkflowRepository, TransitionRecord } from "./ports";
import {
  assertReadable,
  requireNonEmpty,
  requireOwner,
  requireWorkflowAdmin,
  WorkflowError,
  type LeaveRevisionContent,
  type WorkflowActor,
  type WorkflowStatus,
} from "./types";

const REFERENCE_TYPE = "LEAVE_REQUEST_REVISION";

function validateDates(content: LeaveRevisionContent) {
  countWorkingDays({ startDate: content.startDate, endDate: content.endDate });
  requireNonEmpty(content.reason, "Alasan", 10_000);
}

function sameTransition(
  existing: TransitionRecord,
  expected: Omit<TransitionRecord, "id" | "occurredAt">,
) {
  return (
    existing.requestId === expected.requestId &&
    existing.toStatus === expected.toStatus &&
    existing.actorUserId === expected.actorUserId &&
    existing.reason === expected.reason &&
    existing.evidenceReference === expected.evidenceReference
  );
}

export class LeaveWorkflowService {
  constructor(private readonly repository: WorkflowRepository) {}

  async createDraft(actor: WorkflowActor, content: LeaveRevisionContent) {
    if (actor.role !== "PEGAWAI")
      throw new WorkflowError("FORBIDDEN", "Forbidden");
    validateDates(content);
    return this.repository.createLeaveDraft(actor.employeeId, {
      ...content,
      reason: content.reason.trim(),
    });
  }

  async updateDraft(
    actor: WorkflowActor,
    requestId: string,
    content: LeaveRevisionContent,
  ) {
    validateDates(content);
    const request = await this.get(actor, requestId);
    requireOwner(actor, request.employeeId);
    if (
      request.status !== "DRAFT" &&
      request.status !== "RETURNED_FOR_CORRECTION"
    )
      throw new WorkflowError(
        "ILLEGAL_TRANSITION",
        "Revisi yang sudah diajukan tidak dapat diubah.",
      );
    if (request.currentRevision.submittedAt)
      throw new WorkflowError(
        "ILLEGAL_TRANSITION",
        "Revisi yang sudah diajukan tidak dapat diubah.",
      );
    return this.repository.updateLeaveRevision(
      requestId,
      request.currentRevision.id,
      {
        ...content,
        reason: content.reason.trim(),
      },
    );
  }

  async get(actor: WorkflowActor, requestId: string) {
    const request = await this.repository.getLeave(requestId);
    if (!request)
      throw new WorkflowError("NOT_FOUND", "Pengajuan cuti tidak ditemukan.");
    assertReadable(actor, request.employeeId);
    return request;
  }

  async revisions(actor: WorkflowActor, requestId: string) {
    await this.get(actor, requestId);
    return this.repository.listLeaveRevisions(requestId);
  }

  async history(actor: WorkflowActor, requestId: string) {
    await this.get(actor, requestId);
    return this.repository.listLeaveTransitions(requestId);
  }

  submit(
    actor: WorkflowActor,
    requestId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      requestId,
      "SUBMITTED",
      idempotencyKey,
      null,
      null,
      now,
    );
  }
  returnForCorrection(
    actor: WorkflowActor,
    requestId: string,
    reason: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      requestId,
      "RETURNED_FOR_CORRECTION",
      idempotencyKey,
      requireNonEmpty(reason, "Alasan pengembalian", 10_000),
      null,
      now,
    );
  }
  reject(
    actor: WorkflowActor,
    requestId: string,
    reason: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      requestId,
      "REJECTED",
      idempotencyKey,
      requireNonEmpty(reason, "Alasan penolakan", 10_000),
      null,
      now,
    );
  }
  approve(
    actor: WorkflowActor,
    requestId: string,
    evidenceReference: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      requestId,
      "APPROVED",
      idempotencyKey,
      null,
      requireNonEmpty(evidenceReference, "Referensi bukti"),
      now,
    );
  }
  cancel(
    actor: WorkflowActor,
    requestId: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.transition(
      actor,
      requestId,
      "CANCELLED",
      idempotencyKey,
      null,
      null,
      now,
    );
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
    // M3 appends a bucket suffix, so keep the base within its established limit.
    const idempotencyKey = requireNonEmpty(rawKey, "Idempotency key", 140);
    return this.repository.transaction(async (tx) => {
      // Parent is deliberately the first locked business row. It serializes all
      // competing decisions before account locks are acquired in M3 order.
      const request = await tx.lockLeaveRequest(requestId);
      if (!request)
        throw new WorkflowError("NOT_FOUND", "Pengajuan cuti tidak ditemukan.");
      const fromStatus = target === "SUBMITTED" ? request.status : "SUBMITTED";
      const expected = {
        requestId,
        revisionId: request.currentRevision.id,
        fromStatus,
        toStatus: target,
        actorUserId: actor.userId,
        reason,
        evidenceReference,
        idempotencyKey,
      } as const;
      const retry = await tx.findLeaveTransitionByKey(idempotencyKey);
      if (retry) {
        if (
          !sameTransition(retry, expected) ||
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
        if (
          request.status !== "DRAFT" &&
          request.status !== "RETURNED_FOR_CORRECTION"
        )
          throw new WorkflowError(
            "ILLEGAL_TRANSITION",
            "Pengajuan tidak dapat diajukan dari status saat ini.",
          );
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

      const revision = request.currentRevision;
      const annual = revision.leaveType === "ANNUAL";
      const balance = new AnnualBalanceMutationService(
        tx.annualBalanceRepository,
      );
      if (
        annual &&
        target === "SUBMITTED" &&
        revision.startDate.slice(0, 4) !== revision.endDate.slice(0, 4)
      )
        throw new WorkflowError(
          "UNSUPPORTED_POLICY",
          "Cuti Tahunan lintas tahun kalender belum didukung.",
        );
      const mutation = {
        employeeId: request.employeeId,
        entitlementYear: Number(revision.startDate.slice(0, 4)),
        reference: { referenceType: REFERENCE_TYPE, referenceId: revision.id },
        idempotencyKey,
        occurredAt: now,
      };

      let workingDays: number | null = revision.calculatedWorkingDays;
      if (target === "SUBMITTED" && annual) {
        const overrides = await tx.listCalendarOverrides(
          revision.startDate,
          revision.endDate,
        );
        workingDays = countWorkingDays({
          startDate: revision.startDate,
          endDate: revision.endDate,
          calendarOverrides: overrides,
        });
        if (workingDays <= 0)
          throw new WorkflowError(
            "VALIDATION",
            "Cuti Tahunan harus memiliki sedikitnya satu hari kerja.",
          );
        await balance.reserveAnnualLeave({
          ...mutation,
          requestedDays: workingDays,
        });
      } else if (annual && request.status === "SUBMITTED") {
        if (target === "APPROVED") await balance.commitAnnualLeave(mutation);
        else await balance.releaseAnnualLeaveReservation(mutation);
      }

      if (target === "SUBMITTED")
        await tx.submitLeaveRevision(revision.id, now, workingDays);
      await tx.setLeaveStatus(requestId, target);
      const transition = await tx.appendLeaveTransition({
        ...expected,
        occurredAt: now,
      });
      if (target === "RETURNED_FOR_CORRECTION")
        await tx.createLeaveCorrection(request);
      return transition;
    });
  }
}
