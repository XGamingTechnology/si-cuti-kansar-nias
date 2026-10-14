-- AlterEnum
ALTER TYPE "LeaveDocumentType" ADD VALUE 'RETURN_BASIS';

-- CreateTable
CREATE TABLE "LeaveDecisionArchive" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "transitionId" UUID NOT NULL,
    "sourceDocumentId" UUID,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveDecisionArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDecisionArtifact" (
    "id" UUID NOT NULL,
    "archiveId" UUID NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveDecisionArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceReturn" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "entitlementYear" INTEGER NOT NULL,
    "restoredDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "basisReference" VARCHAR(191) NOT NULL,
    "basisDate" DATE NOT NULL,
    "evidenceDocumentId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceIp" VARCHAR(64),
    "idempotencyKey" VARCHAR(140) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "policyVersion" VARCHAR(100) NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "LeaveBalanceReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceReturnOperation" (
    "returnId" UUID NOT NULL,
    "operationId" UUID NOT NULL,

    CONSTRAINT "LeaveBalanceReturnOperation_pkey" PRIMARY KEY ("returnId","operationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionArchive_transitionId_key" ON "LeaveDecisionArchive"("transitionId");

-- CreateIndex
CREATE INDEX "LeaveDecisionArchive_leaveRequestId_idx" ON "LeaveDecisionArchive"("leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionArchive_transitionId_revisionId_leaveRequestId_key" ON "LeaveDecisionArchive"("transitionId", "revisionId", "leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionArtifact_archiveId_key" ON "LeaveDecisionArtifact"("archiveId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionArtifact_storageKey_key" ON "LeaveDecisionArtifact"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceReturn_idempotencyKey_key" ON "LeaveBalanceReturn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LeaveBalanceReturn_leaveRequestId_recordedAt_idx" ON "LeaveBalanceReturn"("leaveRequestId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceReturnOperation_operationId_key" ON "LeaveBalanceReturnOperation"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDocument_id_revisionId_leaveRequestId_key" ON "LeaveDocument"("id", "revisionId", "leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequestTransition_id_revisionId_leaveRequestId_key" ON "LeaveRequestTransition"("id", "revisionId", "leaveRequestId");

-- AddForeignKey
ALTER TABLE "LeaveDecisionArchive" ADD CONSTRAINT "LeaveDecisionArchive_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDecisionArchive" ADD CONSTRAINT "LeaveDecisionArchive_revisionId_leaveRequestId_fkey" FOREIGN KEY ("revisionId", "leaveRequestId") REFERENCES "LeaveRequestRevision"("id", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDecisionArchive" ADD CONSTRAINT "LeaveDecisionArchive_transitionId_revisionId_leaveRequestI_fkey" FOREIGN KEY ("transitionId", "revisionId", "leaveRequestId") REFERENCES "LeaveRequestTransition"("id", "revisionId", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDecisionArchive" ADD CONSTRAINT "LeaveDecisionArchive_sourceDocumentId_revisionId_leaveRequ_fkey" FOREIGN KEY ("sourceDocumentId", "revisionId", "leaveRequestId") REFERENCES "LeaveDocument"("id", "revisionId", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDecisionArtifact" ADD CONSTRAINT "LeaveDecisionArtifact_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "LeaveDecisionArchive"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturn" ADD CONSTRAINT "LeaveBalanceReturn_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturn" ADD CONSTRAINT "LeaveBalanceReturn_revisionId_leaveRequestId_fkey" FOREIGN KEY ("revisionId", "leaveRequestId") REFERENCES "LeaveRequestRevision"("id", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturn" ADD CONSTRAINT "LeaveBalanceReturn_evidenceDocumentId_revisionId_leaveRequ_fkey" FOREIGN KEY ("evidenceDocumentId", "revisionId", "leaveRequestId") REFERENCES "LeaveDocument"("id", "revisionId", "leaveRequestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturn" ADD CONSTRAINT "LeaveBalanceReturn_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturnOperation" ADD CONSTRAINT "LeaveBalanceReturnOperation_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "LeaveBalanceReturn"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveBalanceReturnOperation" ADD CONSTRAINT "LeaveBalanceReturnOperation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AnnualBalanceOperation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- New records never permit non-positive days or empty generated artifacts.
ALTER TABLE "LeaveBalanceReturn" ADD CONSTRAINT "LeaveBalanceReturn_positive_days" CHECK ("restoredDays" > 0);
ALTER TABLE "LeaveDecisionArtifact" ADD CONSTRAINT "LeaveDecisionArtifact_positive_size" CHECK ("sizeBytes" > 0);
