export const DECISION_EDITION_RENDERER = "form-stamp-v2";
import type {
  DocumentStorage,
  StoredDocument,
} from "@/application/ports/document-storage";
import type { LeaveRequestRecord } from "@/application/workflow/ports";
import type {
  AnnualBalanceAccountState,
  AnnualBalanceMutationRepository,
  AnnualBalanceOperationRecord,
} from "@/application/leave-balance/ports";

export type DecisionSnapshot = {
  sourceReview?: { actorUserId: string; actorName: string; reviewedAt: string };
  status: "APPROVED" | "REJECTED";
  requestId: string;
  revisionId: string;
  revisionNumber: number;
  employeeName: string;
  employeeId: string;
  employeeNip: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  actorUserId: string;
  actorName: string;
  occurredAt: string;
  reason: string | null;
  evidenceReference: string | null;
  sourceDocumentVersion: number | null;
  sourceChecksumSha256: string | null;
};
export type DecisionPlacement = {
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
};
export type DecisionEdition = StoredDocument & {
  id: string;
  archiveId: string;
  version: number;
  placement: DecisionPlacement;
  sourceChecksumSha256: string;
  createdByUserId: string;
  createdAt: Date;
  idempotencyKey: string;
  payloadHash: string;
};
export type DecisionArtifact = StoredDocument & { id: string };
export type DecisionArchive = {
  id: string;
  leaveRequestId: string;
  revisionId: string;
  transitionId: string;
  sourceDocumentId: string | null;
  sourceStorageKey: string | null;
  snapshot: DecisionSnapshot;
  artifact: DecisionArtifact | null;
  editions?: readonly DecisionEdition[];
};
export type ReturnInput = {
  restoredDays: number;
  reason: string;
  basisReference: string;
  basisDate: string;
  evidenceDocumentId: string;
  unusedDaysConfirmed: boolean;
};
export type ReturnSnapshot = {
  unusedDaysConfirmed: true;
  evidenceChecksum: string;
  accountsBefore: readonly AnnualBalanceAccountState[];
  accountsAfter: readonly AnnualBalanceAccountState[];
  allocations: readonly {
    bucket: string;
    days: number;
    compensatesOperationId: string;
  }[];
  previouslyRestoredDays: number;
  originalCommittedDays: number;
};
export type ReturnRecord = {
  id: string;
  leaveRequestId: string;
  revisionId: string;
  entitlementYear: number;
  restoredDays: number;
  reason: string;
  basisReference: string;
  basisDate: string;
  evidenceDocumentId: string;
  recordedByUserId: string;
  recordedAt: Date;
  sourceIp: string | null;
  idempotencyKey: string;
  payloadHash: string;
  policyVersion: string;
  snapshot: ReturnSnapshot;
};
export type ReturnState = {
  request: LeaveRequestRecord;
  accounts: readonly AnnualBalanceAccountState[];
  commits: readonly AnnualBalanceOperationRecord[];
  reversals: readonly AnnualBalanceOperationRecord[];
  hasDownstreamRollover: boolean;
};
export interface ReturnTransaction {
  state: ReturnState;
  annualBalanceRepository: AnnualBalanceMutationRepository;
  findRetry(key: string): Promise<ReturnRecord | null>;
  evidence(id: string): Promise<{
    revisionId: string;
    leaveRequestId: string;
    checksum: string;
    storageKey: string;
    documentType: string;
  } | null>;
  create(
    record: ReturnRecord,
    operations: readonly AnnualBalanceOperationRecord[],
  ): Promise<ReturnRecord>;
  freshAccounts(): Promise<readonly AnnualBalanceAccountState[]>;
}
export interface LeaveRecordsRepository {
  saveEdition(
    record: Omit<DecisionEdition, "version">,
  ): Promise<DecisionEdition>;

  verifyLegacyDecision(
    requestId: string,
    documentId: string | null,
    actorUserId: string,
    actorName: string,
    now: Date,
  ): Promise<void>;
  decision(requestId: string): Promise<DecisionArchive | null>;
  createArtifact(
    archiveId: string,
    stored: StoredDocument,
  ): Promise<DecisionArtifact>;
  withReturnTransaction<T>(
    requestId: string,
    work: (tx: ReturnTransaction) => Promise<T>,
  ): Promise<T>;
  returns(requestId: string): Promise<readonly ReturnRecord[]>;
}
export type LeaveRecordsDependencies = {
  repository: LeaveRecordsRepository;
  storage: DocumentStorage;
};
