-- CreateTable
CREATE TABLE "LeaveDecisionEdition" (
    "id" UUID NOT NULL,
    "archiveId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "placement" JSONB NOT NULL,
    "sourceVerified" BOOLEAN NOT NULL DEFAULT true,
    "rendererVersion" VARCHAR(50) NOT NULL DEFAULT 'form-stamp-v1',
    "sourceChecksumSha256" CHAR(64) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,

    CONSTRAINT "LeaveDecisionEdition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionEdition_idempotencyKey_key" ON "LeaveDecisionEdition"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionEdition_storageKey_key" ON "LeaveDecisionEdition"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecisionEdition_archiveId_version_key" ON "LeaveDecisionEdition"("archiveId", "version");

-- AddForeignKey
ALTER TABLE "LeaveDecisionEdition" ADD CONSTRAINT "LeaveDecisionEdition_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "LeaveDecisionArchive"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LeaveDecisionEdition" ADD CONSTRAINT "LeaveDecisionEdition_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "LeaveDecisionEdition" ADD CONSTRAINT "LeaveDecisionEdition_positive_version" CHECK ("version" > 0);
ALTER TABLE "LeaveDecisionEdition" ADD CONSTRAINT "LeaveDecisionEdition_positive_size" CHECK ("sizeBytes" > 0);
