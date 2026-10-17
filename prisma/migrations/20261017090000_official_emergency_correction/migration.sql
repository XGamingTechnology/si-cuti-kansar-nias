ALTER TABLE "LeaveAuthorizedOfficialAssignment" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveAuthorizedOfficialAssignment" ADD CONSTRAINT "Official_revision_nonnegative" CHECK ("revision" >= 0);
CREATE TABLE "LeaveAuthorizedOfficialCorrection" (
  "id" UUID NOT NULL PRIMARY KEY,
  "assignmentId" UUID NOT NULL REFERENCES "LeaveAuthorizedOfficialAssignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "correctedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" VARCHAR(1000) NOT NULL CHECK (length(btrim("reason")) > 0),
  "sourceReference" VARCHAR(500) NOT NULL CHECK (length(btrim("sourceReference")) > 0),
  "fields" TEXT[] NOT NULL CHECK (cardinality("fields") > 0 AND "fields" <@ ARRAY['fullName','nip','capacity','effectiveFrom','effectiveTo']::TEXT[]),
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "idempotencyKey" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL
);
CREATE UNIQUE INDEX "LeaveAuthorizedOfficialCorrection_idempotencyKey_key" ON "LeaveAuthorizedOfficialCorrection"("idempotencyKey");
CREATE UNIQUE INDEX "LeaveAuthorizedOfficialCorrection_assignmentId_revision_key" ON "LeaveAuthorizedOfficialCorrection"("assignmentId", "revision");
CREATE INDEX "LeaveAuthorizedOfficialCorrection_assignmentId_correctedAt_idx" ON "LeaveAuthorizedOfficialCorrection"("assignmentId", "correctedAt");
-- Corrections are immutable, including for accidental adapter updates/deletes.
CREATE FUNCTION reject_official_correction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Official correction history is append-only';
END;
$$;
CREATE TRIGGER "OfficialCorrection_append_only" BEFORE UPDATE OR DELETE ON "LeaveAuthorizedOfficialCorrection"
FOR EACH ROW EXECUTE FUNCTION reject_official_correction_mutation();
