CREATE TYPE "LeaveAuthorizedOfficialCapacity" AS ENUM ('DEFINITIVE', 'PLT', 'PLH');

CREATE TABLE "LeaveAuthorizedOfficialAssignment" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "nip" VARCHAR(32) NOT NULL,
    "capacity" "LeaveAuthorizedOfficialCapacity" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceReference" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeaveAuthorizedOfficialAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeaveAuthorizedOfficialAssignment_effective_period_check"
      CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    CONSTRAINT "LeaveAuthorizedOfficialAssignment_no_period_overlap"
      EXCLUDE USING GIST (
        daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[]') WITH &&
      )
);

CREATE INDEX "LeaveAuthorizedOfficialAssignment_effectiveFrom_effectiveTo_idx"
ON "LeaveAuthorizedOfficialAssignment"("effectiveFrom", "effectiveTo");
