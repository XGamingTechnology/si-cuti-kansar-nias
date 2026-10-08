-- Version signed leave-document archives without overwriting prior evidence.
ALTER TABLE "LeaveDocument"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "originalFileName" VARCHAR(255),
  ADD COLUMN "uploadedByUserId" UUID,
  ADD COLUMN "uploadedAt" TIMESTAMPTZ(3),
  ADD COLUMN "sourceIp" VARCHAR(64);

DROP INDEX IF EXISTS "LeaveDocument_revisionId_documentType_key";

CREATE UNIQUE INDEX "LeaveDocument_revisionId_documentType_version_key"
  ON "LeaveDocument"("revisionId", "documentType", "version");

CREATE INDEX "LeaveDocument_uploadedByUserId_uploadedAt_idx"
  ON "LeaveDocument"("uploadedByUserId", "uploadedAt");

ALTER TABLE "LeaveDocument"
  ADD CONSTRAINT "LeaveDocument_version_positive"
  CHECK ("version" > 0);

ALTER TABLE "LeaveDocument"
  ADD CONSTRAINT "LeaveDocument_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
