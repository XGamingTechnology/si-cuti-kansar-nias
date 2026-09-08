-- CreateEnum
CREATE TYPE "WorkflowRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED_FOR_CORRECTION', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'IMPORTANT_REASON', 'LARGE', 'MATERNITY', 'CLTN');

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "WorkflowRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveRequestRevision" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "calculatedWorkingDays" INTEGER,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LeaveRequestRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaveRequestRevision_revisionNumber_positive" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "LeaveRequestRevision_valid_date_range" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "LeaveRequestRevision_calculatedWorkingDays_positive" CHECK ("calculatedWorkingDays" IS NULL OR "calculatedWorkingDays" > 0)
);

CREATE TABLE "LeaveRequestTransition" (
    "id" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "fromStatus" "WorkflowRequestStatus" NOT NULL,
    "toStatus" "WorkflowRequestStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT,
    "evidenceReference" VARCHAR(191),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequestTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionType" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PermissionType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionRequest" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "WorkflowRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PermissionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionRequestRevision" (
    "id" UUID NOT NULL,
    "permissionRequestId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "permissionTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PermissionRequestRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PermissionRequestRevision_revisionNumber_positive" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "PermissionRequestRevision_valid_date_range" CHECK ("endDate" >= "startDate")
);

CREATE TABLE "PermissionRequestTransition" (
    "id" UUID NOT NULL,
    "permissionRequestId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "fromStatus" "WorkflowRequestStatus" NOT NULL,
    "toStatus" "WorkflowRequestStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT,
    "evidenceReference" VARCHAR(191),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PermissionRequestTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");
CREATE INDEX "LeaveRequest_employeeId_createdAt_idx" ON "LeaveRequest"("employeeId", "createdAt");
CREATE UNIQUE INDEX "LeaveRequestRevision_leaveRequestId_revisionNumber_key" ON "LeaveRequestRevision"("leaveRequestId", "revisionNumber");
CREATE UNIQUE INDEX "LeaveRequestTransition_idempotencyKey_key" ON "LeaveRequestTransition"("idempotencyKey");
CREATE UNIQUE INDEX "PermissionType_code_key" ON "PermissionType"("code");
CREATE INDEX "PermissionRequest_employeeId_status_idx" ON "PermissionRequest"("employeeId", "status");
CREATE INDEX "PermissionRequest_employeeId_createdAt_idx" ON "PermissionRequest"("employeeId", "createdAt");
CREATE UNIQUE INDEX "PermissionRequestRevision_permissionRequestId_revisionNumber_key" ON "PermissionRequestRevision"("permissionRequestId", "revisionNumber");
CREATE INDEX "PermissionRequestRevision_permissionTypeId_idx" ON "PermissionRequestRevision"("permissionTypeId");
CREATE UNIQUE INDEX "PermissionRequestTransition_idempotencyKey_key" ON "PermissionRequestTransition"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "LeaveRequestRevision" ADD CONSTRAINT "LeaveRequestRevision_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "LeaveRequestTransition" ADD CONSTRAINT "LeaveRequestTransition_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "LeaveRequestTransition" ADD CONSTRAINT "LeaveRequestTransition_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LeaveRequestRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "LeaveRequestTransition" ADD CONSTRAINT "LeaveRequestTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequest" ADD CONSTRAINT "PermissionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequestRevision" ADD CONSTRAINT "PermissionRequestRevision_permissionRequestId_fkey" FOREIGN KEY ("permissionRequestId") REFERENCES "PermissionRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequestRevision" ADD CONSTRAINT "PermissionRequestRevision_permissionTypeId_fkey" FOREIGN KEY ("permissionTypeId") REFERENCES "PermissionType"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequestTransition" ADD CONSTRAINT "PermissionRequestTransition_permissionRequestId_fkey" FOREIGN KEY ("permissionRequestId") REFERENCES "PermissionRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequestTransition" ADD CONSTRAINT "PermissionRequestTransition_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PermissionRequestRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PermissionRequestTransition" ADD CONSTRAINT "PermissionRequestTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
