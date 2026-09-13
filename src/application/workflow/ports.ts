import type { AnnualBalanceMutationRepository } from "@/application/leave-balance/ports";
import type {
  LeaveRevisionContent,
  PermissionRevisionContent,
  WorkflowStatus,
} from "./types";

export type LeaveRevision = LeaveRevisionContent &
  Readonly<{
    id: string;
    requestId: string;
    revisionNumber: number;
    calculatedWorkingDays: number | null;
    submittedAt: Date | null;
  }>;
export type PermissionRevision = PermissionRevisionContent &
  Readonly<{
    id: string;
    requestId: string;
    revisionNumber: number;
    submittedAt: Date | null;
    permissionTypeActive?: boolean;
  }>;
export type WorkflowEmployeeSummary = Readonly<{
  id: string;
  nip: string;
  fullName: string;
  positionTitle: string;
  workUnit: string;
  employmentStartDate?: string | null;
  directSupervisor?: Readonly<{
    nip: string;
    fullName: string;
    positionTitle: string;
  }> | null;
}>;

export type LeaveRequestRecord = Readonly<{
  id: string;
  employeeId: string;
  employee: WorkflowEmployeeSummary;
  status: WorkflowStatus;
  currentRevisionNumber: number;
  currentRevision: LeaveRevision;
}>;
export type PermissionRequestRecord = Readonly<{
  id: string;
  employeeId: string;
  employee: WorkflowEmployeeSummary;
  status: WorkflowStatus;
  currentRevisionNumber: number;
  currentRevision: PermissionRevision;
}>;
export type TransitionRecord = Readonly<{
  id: string;
  requestId: string;
  revisionId: string;
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  actorUserId: string;
  reason: string | null;
  evidenceReference: string | null;
  occurredAt: Date;
  idempotencyKey: string;
}>;

export type TransitionWrite = Omit<TransitionRecord, "id">;
export type PermissionTypeRecord = Readonly<{
  id: string;
  code: string;
  name: string;
  description: string | null;
}>;

export interface WorkflowTransaction {
  readonly annualBalanceRepository: AnnualBalanceMutationRepository;
  lockLeaveRequest(id: string): Promise<LeaveRequestRecord | null>;
  lockPermissionRequest(id: string): Promise<PermissionRequestRecord | null>;
  findLeaveTransitionByKey(key: string): Promise<TransitionRecord | null>;
  findPermissionTransitionByKey(key: string): Promise<TransitionRecord | null>;
  setLeaveStatus(id: string, status: WorkflowStatus): Promise<void>;
  setPermissionStatus(id: string, status: WorkflowStatus): Promise<void>;
  submitLeaveRevision(
    id: string,
    at: Date,
    workingDays: number | null,
  ): Promise<void>;
  submitPermissionRevision(id: string, at: Date): Promise<void>;
  createLeaveCorrection(request: LeaveRequestRecord): Promise<LeaveRevision>;
  createPermissionCorrection(
    request: PermissionRequestRecord,
  ): Promise<PermissionRevision>;
  appendLeaveTransition(input: TransitionWrite): Promise<TransitionRecord>;
  appendPermissionTransition(input: TransitionWrite): Promise<TransitionRecord>;
  permissionTypeIsActive(id: string): Promise<boolean>;
  listCalendarOverrides(
    startDate: string,
    endDate: string,
  ): Promise<
    readonly {
      date: string;
      type: "PUBLIC_HOLIDAY" | "JOINT_LEAVE" | "INSTITUTION_NON_WORKING";
    }[]
  >;
}

export interface WorkflowRepository {
  transaction<T>(
    work: (transaction: WorkflowTransaction) => Promise<T>,
  ): Promise<T>;
  createLeaveDraft(
    employeeId: string,
    content: LeaveRevisionContent,
  ): Promise<LeaveRequestRecord>;
  createPermissionDraft(
    employeeId: string,
    content: PermissionRevisionContent,
  ): Promise<PermissionRequestRecord>;
  updateLeaveRevision(
    id: string,
    revisionId: string,
    content: LeaveRevisionContent,
  ): Promise<LeaveRequestRecord>;
  updatePermissionRevision(
    id: string,
    revisionId: string,
    content: PermissionRevisionContent,
  ): Promise<PermissionRequestRecord>;
  getLeave(id: string): Promise<LeaveRequestRecord | null>;
  getPermission(id: string): Promise<PermissionRequestRecord | null>;
  listLeaves(employeeId?: string): Promise<readonly LeaveRequestRecord[]>;
  listPermissions(
    employeeId?: string,
  ): Promise<readonly PermissionRequestRecord[]>;
  listActivePermissionTypes(): Promise<readonly PermissionTypeRecord[]>;
  listLeaveRevisions(id: string): Promise<readonly LeaveRevision[]>;
  listPermissionRevisions(id: string): Promise<readonly PermissionRevision[]>;
  listLeaveTransitions(id: string): Promise<readonly TransitionRecord[]>;
  listPermissionTransitions(id: string): Promise<readonly TransitionRecord[]>;
  permissionTypeIsActive(id: string): Promise<boolean>;
}
