import type { Principal } from "@/modules/auth/service";

export const WORKFLOW_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const LEAVE_TYPES = [
  "ANNUAL",
  "SICK",
  "IMPORTANT_REASON",
  "LARGE",
  "MATERNITY",
  "CLTN",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export type WorkflowActor = Principal;
export type RevisionContent = Readonly<{
  startDate: string;
  endDate: string;
  reason: string;
}>;
export type LeaveRevisionContent = RevisionContent &
  Readonly<{ leaveType: LeaveType }>;
export type PermissionRevisionContent = RevisionContent &
  Readonly<{ permissionTypeId: string }>;

export type WorkflowTransitionAction =
  | "SUBMIT"
  | "RETURN"
  | "REJECT"
  | "APPROVE"
  | "CANCEL";

export class WorkflowError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "ILLEGAL_TRANSITION"
      | "CONFLICT"
      | "UNSUPPORTED_POLICY",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export function requireNonEmpty(value: string, field: string, max = 191) {
  const result = value.trim();
  if (!result || result.length > max)
    throw new WorkflowError(
      "VALIDATION",
      `${field} wajib diisi dan maksimal ${max} karakter.`,
    );
  return result;
}

export function requireOwner(actor: WorkflowActor, employeeId: string) {
  if (actor.role !== "PEGAWAI" || actor.employeeId !== employeeId)
    throw new WorkflowError("FORBIDDEN", "Forbidden");
}

export function requireWorkflowAdmin(actor: WorkflowActor) {
  if (actor.role !== "ADMIN_KEPEGAWAIAN")
    throw new WorkflowError("FORBIDDEN", "Forbidden");
}

export function assertReadable(actor: WorkflowActor, employeeId: string) {
  if (
    actor.role !== "ADMIN_KEPEGAWAIAN" &&
    (actor.role !== "PEGAWAI" || actor.employeeId !== employeeId)
  )
    throw new WorkflowError("FORBIDDEN", "Forbidden");
}
