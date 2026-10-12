-- Add the employee-selected place used on the official leave form.
-- Existing revisions intentionally remain valid with a NULL value.
ALTER TABLE "LeaveRequestRevision" ADD COLUMN "formPlace" VARCHAR(100);
