-- Widen only the accepted assignment vocabulary; old rows remain valid.
-- NOT VALID avoids a table scan under the exclusive constraint replacement lock.
BEGIN;
ALTER TABLE "JointLeaveClaim" DROP CONSTRAINT "JointLeaveClaim_assignment_check";
ALTER TABLE "JointLeaveClaim" ADD CONSTRAINT "JointLeaveClaim_assignment_check"
  CHECK ("assignmentType" IN ('SPECIAL_STANDBY','OPERATIONS','REGULAR_STANDBY','SPRIN_ASSIGNMENT')) NOT VALID;
COMMIT;
ALTER TABLE "JointLeaveClaim" VALIDATE CONSTRAINT "JointLeaveClaim_assignment_check";
