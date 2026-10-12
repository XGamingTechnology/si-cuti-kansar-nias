-- CreateEnum
CREATE TYPE "ApplicationRole" AS ENUM ('ADMIN_KEPEGAWAIAN', 'PEGAWAI');

-- CreateEnum
CREATE TYPE "AuthenticationProvider" AS ENUM ('LOCAL');

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "nip" VARCHAR(32) NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "positionTitle" VARCHAR(200) NOT NULL,
    "workUnit" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "directSupervisorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Employee_directSupervisor_not_self" CHECK (
        "directSupervisorId" IS NULL OR "directSupervisorId" <> "id"
    )
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "role" "ApplicationRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthenticationProvider" NOT NULL,
    "providerSubject" VARCHAR(191) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthenticationIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCredential" (
    "authenticationIdentityId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("authenticationIdentityId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "authenticationIdentityId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_expiry_after_creation" CHECK ("expiresAt" > "createdAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nip_key" ON "Employee"("nip");

-- CreateIndex
CREATE INDEX "Employee_directSupervisorId_idx" ON "Employee"("directSupervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationIdentity_provider_providerSubject_key" ON "AuthenticationIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationIdentity_userId_provider_key" ON "AuthenticationIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_authenticationIdentityId_revokedAt_idx" ON "Session"("authenticationIdentityId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_directSupervisorId_fkey" FOREIGN KEY ("directSupervisorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuthenticationIdentity" ADD CONSTRAINT "AuthenticationIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LocalCredential" ADD CONSTRAINT "LocalCredential_authenticationIdentityId_fkey" FOREIGN KEY ("authenticationIdentityId") REFERENCES "AuthenticationIdentity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_authenticationIdentityId_fkey" FOREIGN KEY ("authenticationIdentityId") REFERENCES "AuthenticationIdentity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
