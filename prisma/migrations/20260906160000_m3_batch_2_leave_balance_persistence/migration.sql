-- CreateEnum
CREATE TYPE "WorkingCalendarExceptionType" AS ENUM ('PUBLIC_HOLIDAY', 'JOINT_LEAVE', 'INSTITUTION_NON_WORKING', 'WORKING_DAY_OVERRIDE');

-- CreateEnum
CREATE TYPE "AnnualBalanceBucket" AS ENUM ('JOINT_LEAVE_CLAIM', 'N2', 'N1', 'N');

-- CreateEnum
CREATE TYPE "AnnualBalanceOperationType" AS ENUM ('GRANT', 'RESERVE', 'RELEASE', 'COMMIT', 'REVERSAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "WorkingCalendarException" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "WorkingCalendarExceptionType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sourceReference" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkingCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualBalanceAccount" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "entitlementYear" INTEGER NOT NULL,
    "bucket" "AnnualBalanceBucket" NOT NULL,
    "grantedDays" INTEGER NOT NULL DEFAULT 0,
    "reservedDays" INTEGER NOT NULL DEFAULT 0,
    "committedDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AnnualBalanceAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnnualBalanceAccount_grantedDays_nonnegative" CHECK ("grantedDays" >= 0),
    CONSTRAINT "AnnualBalanceAccount_reservedDays_nonnegative" CHECK ("reservedDays" >= 0),
    CONSTRAINT "AnnualBalanceAccount_committedDays_nonnegative" CHECK ("committedDays" >= 0),
    CONSTRAINT "AnnualBalanceAccount_within_grant" CHECK ("reservedDays" + "committedDays" <= "grantedDays")
);

-- CreateTable
CREATE TABLE "AnnualBalanceOperation" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "entitlementYear" INTEGER NOT NULL,
    "bucket" "AnnualBalanceBucket" NOT NULL,
    "operationType" "AnnualBalanceOperationType" NOT NULL,
    "days" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "referenceType" VARCHAR(100),
    "referenceId" VARCHAR(191),
    "compensatesOperationId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnualBalanceOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnnualBalanceOperation_days_positive" CHECK ("days" > 0)
);

-- CreateTable
CREATE TABLE "AnnualRolloverCommit" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "committedAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnualRolloverCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JointLeaveEvent" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "claimDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceReference" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JointLeaveEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JointLeaveEvent_claimDays_positive" CHECK ("claimDays" > 0),
    CONSTRAINT "JointLeaveEvent_valid_date_range" CHECK ("startDate" <= "endDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkingCalendarException_date_key" ON "WorkingCalendarException"("date");
CREATE UNIQUE INDEX "AnnualBalanceAccount_employeeId_entitlementYear_bucket_key" ON "AnnualBalanceAccount"("employeeId", "entitlementYear", "bucket");
CREATE UNIQUE INDEX "AnnualBalanceOperation_idempotencyKey_key" ON "AnnualBalanceOperation"("idempotencyKey");
CREATE INDEX "AnnualBalanceOperation_employeeId_entitlementYear_bucket_occurredAt_idx" ON "AnnualBalanceOperation"("employeeId", "entitlementYear", "bucket", "occurredAt");
CREATE INDEX "AnnualBalanceOperation_compensatesOperationId_idx" ON "AnnualBalanceOperation"("compensatesOperationId");
CREATE UNIQUE INDEX "AnnualRolloverCommit_idempotencyKey_key" ON "AnnualRolloverCommit"("idempotencyKey");
CREATE UNIQUE INDEX "AnnualRolloverCommit_employeeId_targetYear_key" ON "AnnualRolloverCommit"("employeeId", "targetYear");

-- AddForeignKey
ALTER TABLE "AnnualBalanceAccount" ADD CONSTRAINT "AnnualBalanceAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnnualBalanceOperation" ADD CONSTRAINT "AnnualBalanceOperation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnnualBalanceOperation" ADD CONSTRAINT "AnnualBalanceOperation_compensatesOperationId_fkey" FOREIGN KEY ("compensatesOperationId") REFERENCES "AnnualBalanceOperation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AnnualRolloverCommit" ADD CONSTRAINT "AnnualRolloverCommit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
