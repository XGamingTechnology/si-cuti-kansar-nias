import type {
  DocumentSnapshot,
  LeaveDocumentRecord,
  LeaveDocumentRepository,
} from "./ports";
import type { DocumentStorage } from "@/application/ports/document-storage";

export const SIGNED_LEAVE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export class LeaveDocumentError extends Error {
  constructor(
    public readonly code: "VALIDATION" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "LeaveDocumentError";
  }
}

export type LeaveDocumentMetadata = Readonly<
  Omit<LeaveDocumentRecord, "storageKey" | "snapshot">
>;

function isPdf(content: Uint8Array) {
  return (
    content.byteLength >= 5 &&
    content[0] === 0x25 &&
    content[1] === 0x50 &&
    content[2] === 0x44 &&
    content[3] === 0x46 &&
    content[4] === 0x2d
  );
}

function safeOriginalName(value: string) {
  const cleaned = value
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "_")
    .trim()
    .slice(0, 255);
  return cleaned || "dokumen-cuti.pdf";
}

export function publicLeaveDocument(
  document: LeaveDocumentRecord,
): LeaveDocumentMetadata {
  return {
    id: document.id,
    leaveRequestId: document.leaveRequestId,
    revisionId: document.revisionId,
    documentType: document.documentType,
    version: document.version,
    checksumSha256: document.checksumSha256,
    sizeBytes: document.sizeBytes,
    mimeType: document.mimeType,
    originalFileName: document.originalFileName,
    uploadedByUserId: document.uploadedByUserId,
    uploadedAt: document.uploadedAt,
    sourceIp: document.sourceIp,
    generatedAt: document.generatedAt,
  };
}

export class LeaveDocumentService {
  constructor(
    private readonly repository: LeaveDocumentRepository,
    private readonly storage: DocumentStorage,
  ) {}

  async listForLeaveRequest(leaveRequestId: string) {
    return (await this.repository.listForLeaveRequest(leaveRequestId)).map(
      publicLeaveDocument,
    );
  }

  async uploadApprovedForm(input: {
    leaveRequestId: string;
    revisionId: string;
    uploadedByUserId: string;
    originalFileName: string;
    mimeType: string;
    sourceIp: string | null;
    content: Uint8Array;
    snapshot: DocumentSnapshot;
    now?: Date;
  }) {
    if (!input.content.byteLength)
      throw new LeaveDocumentError("VALIDATION", "File PDF wajib diunggah.");
    if (input.content.byteLength > SIGNED_LEAVE_DOCUMENT_MAX_BYTES)
      throw new LeaveDocumentError(
        "VALIDATION",
        "Ukuran file PDF maksimal 10 MB.",
      );
    if (input.mimeType !== "application/pdf" || !isPdf(input.content))
      throw new LeaveDocumentError(
        "VALIDATION",
        "Dokumen bertanda tangan harus berupa PDF yang valid.",
      );

    const version = await this.repository.nextVersion(
      input.revisionId,
      "APPROVED_FORM",
    );
    const stored = await this.storage.put(input.content);
    const uploadedAt = input.now ?? new Date();

    try {
      return publicLeaveDocument(
        await this.repository.create({
          leaveRequestId: input.leaveRequestId,
          revisionId: input.revisionId,
          documentType: "APPROVED_FORM",
          version,
          storageKey: stored.key,
          checksumSha256: stored.checksum,
          sizeBytes: stored.size,
          mimeType: "application/pdf",
          originalFileName: safeOriginalName(input.originalFileName),
          uploadedByUserId: input.uploadedByUserId,
          uploadedAt,
          sourceIp: input.sourceIp,
          snapshot: input.snapshot,
          generatedAt: uploadedAt,
        }),
      );
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw new LeaveDocumentError(
        "CONFLICT",
        "Dokumen gagal diarsipkan. Silakan coba lagi.",
      );
    }
  }

  async readForLeaveRequest(leaveRequestId: string, documentId: string) {
    const document = await this.repository.findById(documentId);
    if (!document || document.leaveRequestId !== leaveRequestId)
      throw new LeaveDocumentError("NOT_FOUND", "Dokumen tidak ditemukan.");
    return {
      document: publicLeaveDocument(document),
      content: await this.storage.read(document.storageKey),
    };
  }
}
