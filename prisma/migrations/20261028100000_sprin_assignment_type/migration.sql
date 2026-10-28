-- Preserve existing claims while admitting the new assignment category.
ALTER TABLE "JointLeaveClaim"
  DROP CONSTRAINT "JointLeaveClaim_assignment_check";

ALTER TABLE "JointLeaveClaim"
  ADD CONSTRAINT "JointLeaveClaim_assignment_check"
  CHECK ("assignmentType" IN ('SPECIAL_STANDBY','OPERATIONS','REGULAR_STANDBY','SPRIN_ASSIGNMENT'));
