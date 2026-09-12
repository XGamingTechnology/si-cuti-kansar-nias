export const LEAVE_DOCUMENT_TYPES = [
  "SUBMISSION_PROOF",
  "APPROVED_FORM",
] as const;

export type LeaveDocumentType = (typeof LEAVE_DOCUMENT_TYPES)[number];

export type DocumentSnapshotValue =
  | string
  | number
  | boolean
  | null
  | DocumentSnapshotValue[]
  | { [key: string]: DocumentSnapshotValue };

export type DocumentSnapshot = { [key: string]: DocumentSnapshotValue };

export type LeaveDocumentRecord = Readonly<{
  id: string;
  leaveRequestId: string;
  revisionId: string;
  documentType: LeaveDocumentType;
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
  snapshot: DocumentSnapshot;
  generatedAt: Date;
}>;

export type CreateLeaveDocumentInput = Omit<LeaveDocumentRecord, "id">;

export interface LeaveDocumentRepository {
  create(input: CreateLeaveDocumentInput): Promise<LeaveDocumentRecord>;
  findByRevisionAndType(
    revisionId: string,
    documentType: LeaveDocumentType,
  ): Promise<LeaveDocumentRecord | null>;
  findById(id: string): Promise<LeaveDocumentRecord | null>;
  listForLeaveRequest(
    leaveRequestId: string,
  ): Promise<readonly LeaveDocumentRecord[]>;
}
