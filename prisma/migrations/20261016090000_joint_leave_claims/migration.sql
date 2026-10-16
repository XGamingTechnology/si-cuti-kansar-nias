-- AlterTable
-- Old migrations remain unchanged. A rejected date releases only the live uniqueness slot;
-- its business record is retained. This index also protects against direct concurrent inserts.
ALTER TABLE "JointLeavePolicy" ADD COLUMN     "commandKey" UUID,
ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "payloadHash" CHAR(64);

-- AlterTable
ALTER TABLE "JointLeaveEvent" ADD COLUMN     "kind" VARCHAR(20) NOT NULL DEFAULT 'REGULAR';

-- CreateTable
CREATE TABLE "JointLeaveClaim" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "employeeNameSnapshot" VARCHAR(200) NOT NULL,
    "employeeNipSnapshot" VARCHAR(32) NOT NULL,
    "policyId" UUID NOT NULL,
    "creditYear" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "assignmentType" VARCHAR(30) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "sprinNumber" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    "submittedByUserId" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "evidenceKey" VARCHAR(191) NOT NULL,
    "evidenceChecksum" CHAR(64) NOT NULL,
    "evidenceSize" INTEGER NOT NULL,
    "evidenceMime" VARCHAR(50) NOT NULL,
    "reviewKey" UUID,
    "reviewHash" CHAR(64),
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "reviewSnapshot" JSONB,

    CONSTRAINT "JointLeaveClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointLeaveClaimDate" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventDate" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "operationId" UUID,

    CONSTRAINT "JointLeaveClaimDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaim_idempotencyKey_key" ON "JointLeaveClaim"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaim_evidenceKey_key" ON "JointLeaveClaim"("evidenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaim_reviewKey_key" ON "JointLeaveClaim"("reviewKey");

-- CreateIndex
CREATE INDEX "JointLeaveClaim_creditYear_status_submittedAt_idx" ON "JointLeaveClaim"("creditYear", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "JointLeaveClaim_employeeId_creditYear_submittedAt_idx" ON "JointLeaveClaim"("employeeId", "creditYear", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaim_id_employeeId_policyId_key" ON "JointLeaveClaim"("id", "employeeId", "policyId");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaimDate_operationId_key" ON "JointLeaveClaimDate"("operationId");

-- CreateIndex
CREATE INDEX "JointLeaveClaimDate_employeeId_eventDate_status_idx" ON "JointLeaveClaimDate"("employeeId", "eventDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveClaimDate_claimId_eventId_key" ON "JointLeaveClaimDate"("claimId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeavePolicy_commandKey_key" ON "JointLeavePolicy"("commandKey");

-- CreateIndex
CREATE UNIQUE INDEX "JointLeaveEvent_id_policyId_key" ON "JointLeaveEvent"("id", "policyId");

-- AddForeignKey
ALTER TABLE "JointLeavePolicy" ADD CONSTRAINT "JointLeavePolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "JointLeavePolicy"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_claimId_employeeId_policyId_fkey" FOREIGN KEY ("claimId", "employeeId", "policyId") REFERENCES "JointLeaveClaim"("id", "employeeId", "policyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_eventId_policyId_fkey" FOREIGN KEY ("eventId", "policyId") REFERENCES "JointLeaveEvent"("id", "policyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AnnualBalanceOperation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "JointLeaveClaimDate_live_employee_date_key"
ON "JointLeaveClaimDate" ("employeeId", "eventDate") WHERE "status" IN ('PENDING', 'APPROVED');
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_status_check" CHECK ("status" IN ('SUBMITTED','APPROVED','REJECTED'));
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_assignment_check" CHECK ("assignmentType" IN ('SPECIAL_STANDBY','OPERATIONS','REGULAR_STANDBY'));
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_evidence_check" CHECK ("evidenceSize">0 AND "evidenceSize"<=10485760 AND "evidenceMime" IN ('application/pdf','image/jpeg','image/png'));
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_year_check" CHECK ("creditYear" BETWEEN 1900 AND 9998);
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_decision_check" CHECK (
  ("status"='SUBMITTED' AND "reviewKey" IS NULL AND "reviewHash" IS NULL AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL AND "reason" IS NULL AND "reviewSnapshot" IS NULL)
  OR ("status" IN ('APPROVED','REJECTED') AND "reviewKey" IS NOT NULL AND "reviewHash" IS NOT NULL AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reason" IS NOT NULL AND length(trim("reason"))>0 AND "reviewSnapshot" IS NOT NULL)
);
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE "JointLeaveClaimDate" ADD CONSTRAINT "JointLeaveClaimDate_operation_check" CHECK (("status"='APPROVED')=("operationId" IS NOT NULL));
ALTER TABLE "JointLeaveEvent" ADD CONSTRAINT "JointLeaveEvent_kind_check" CHECK ("kind" IN ('REGULAR','YEAR_END'));
