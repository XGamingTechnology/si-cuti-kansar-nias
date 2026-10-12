-- CreateEnum
CREATE TYPE "LeaveDocumentType" AS ENUM ('SUBMISSION_PROOF', 'APPROVED_FORM');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "employmentStartDate" DATE;

-- AlterTable
ALTER TABLE "LeaveRequestRevision"
ADD COLUMN "leaveAddress" TEXT,
ADD COLUMN "leavePhone" VARCHAR(32);

-- CreateTable
CREATE TABLE "LeaveDocument" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "documentType" "LeaveDocumentType" NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "snapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDocument_storageKey_key" ON "LeaveDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDocument_revisionId_documentType_key" ON "LeaveDocument"("revisionId", "documentType");

-- CreateIndex
CREATE INDEX "LeaveDocument_leaveRequestId_generatedAt_idx" ON "LeaveDocument"("leaveRequestId", "generatedAt");

-- AddForeignKey
ALTER TABLE "LeaveDocument" ADD CONSTRAINT "LeaveDocument_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDocument" ADD CONSTRAINT "LeaveDocument_revisionId_leaveRequestId_fkey" FOREIGN KEY ("revisionId", "leaveRequestId") REFERENCES "LeaveRequestRevision"("id", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;
