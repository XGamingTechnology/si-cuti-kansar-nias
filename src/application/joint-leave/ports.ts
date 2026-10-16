import type { Principal } from "@/modules/auth/service";
import type { StoredDocument } from "@/application/ports/document-storage";
import type { AnnualBalanceAccountState } from "@/application/leave-balance/ports";

export type AssignmentType =
  | "SPECIAL_STANDBY"
  | "OPERATIONS"
  | "REGULAR_STANDBY";
export type ClaimStatus = "SUBMITTED" | "APPROVED" | "REJECTED";
export type PolicyInput = {
  name: string;
  creditYear: number;
  quotaDays: number;
  sourceReference: string;
  events: { date: string; name: string; kind: "REGULAR" | "YEAR_END" }[];
};
export type Policy = {
  id: string;
  name: string;
  creditYear: number;
  quotaDays: number;
  sourceReference: string | null;
  isActive: boolean;
  eventDates: { id: string; date: string; name: string; kind: string }[];
};
export type SubmitInput = {
  policyId: string;
  eventIds: string[];
  assignmentType: AssignmentType;
  title: string;
  sprinNumber: string | null;
  idempotencyKey: string;
};
export type ReviewInput = {
  approvedEventIds: string[];
  reason: string;
  evidenceVerified: boolean;
  idempotencyKey: string;
  fingerprint: string;
};
export type Claim = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string;
  policyId: string;
  creditYear: number;
  policySnapshot: Policy;
  assignmentType: string;
  title: string;
  sprinNumber: string | null;
  status: ClaimStatus;
  submittedByUserId: string;
  submittedAt: Date;
  idempotencyKey: string;
  payloadHash: string;
  evidenceKey: string;
  evidenceChecksum: string;
  evidenceSize: number;
  evidenceMime: string;
  reviewKey: string | null;
  reviewHash: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reason: string | null;
  reviewSnapshot: unknown;
  dates: {
    id: string;
    eventId: string;
    eventDate: string;
    status: string;
    operationId: string | null;
  }[];
};
export type ClaimCreate = Omit<
  Claim,
  | "employeeName"
  | "employeeNip"
  | "dates"
  | "reviewKey"
  | "reviewHash"
  | "reviewedByUserId"
  | "reviewedAt"
  | "reason"
  | "reviewSnapshot"
> & { dates: { eventId: string; eventDate: string }[] };
export type ClaimQuery = {
  page: number;
  status?: ClaimStatus;
  year: number;
  search: string;
};
export interface JointLeaveTransaction {
  policy(id: string): Promise<Policy | null>;
  claim(id: string): Promise<Claim | null>;
  retry(key: string): Promise<Claim | null>;
  reviewRetry(key: string): Promise<Claim | null>;
  blockingDates(
    employeeId: string,
    dates: readonly string[],
  ): Promise<string[]>;
  create(input: ClaimCreate): Promise<Claim>;
  accounts(
    employeeId: string,
    year: number,
  ): Promise<AnnualBalanceAccountState[]>;
  approvedDays(employeeId: string, year: number): Promise<number>;
  hasDownstreamRollover(employeeId: string, year: number): Promise<boolean>;
  grant(
    claim: Claim,
    eventIds: readonly string[],
    now: Date,
    reason: string,
  ): Promise<void>;
  decide(
    claim: Claim,
    input: ReviewInput,
    actor: Principal,
    now: Date,
    hash: string,
    snapshot: object,
  ): Promise<Claim>;
}
export interface JointLeaveRepository {
  policies(year: number): Promise<Policy[]>;
  createPolicy(
    input: PolicyInput,
    actor: Principal,
    key: string,
    hash: string,
  ): Promise<Policy>;
  list(
    actor: Principal,
    query: ClaimQuery,
  ): Promise<{ claims: Claim[]; total: number }>;
  claim(id: string): Promise<Claim | null>;
  retry(key: string): Promise<Claim | null>;
  blockingDates(
    employeeId: string,
    dates: readonly string[],
  ): Promise<string[]>;
  withEmployee<T>(
    employeeId: string,
    work: (tx: JointLeaveTransaction) => Promise<T>,
  ): Promise<T>;
}
export type EvidenceInput = { bytes: Uint8Array; mime: string };
export type SavedEvidence = StoredDocument & { mime: string };
