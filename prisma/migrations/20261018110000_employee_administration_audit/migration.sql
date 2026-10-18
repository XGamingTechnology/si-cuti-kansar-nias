CREATE TABLE "EmployeeAdministrationEvent" (
 "id" UUID PRIMARY KEY,
 "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 "targetEmployeeId" UUID REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 "action" VARCHAR(40) NOT NULL CHECK ("action" IN ('EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_ACTIVATE','EMPLOYEE_DEACTIVATE','EMPLOYEE_IMPORT','ACCOUNT_PROVISION','ACCOUNT_ROLE','ACCOUNT_ACTIVATE','ACCOUNT_DEACTIVATE','ACCOUNT_PASSWORD_RESET')),
 "changedFields" TEXT[] NOT NULL DEFAULT '{}',
 "employeeIds" UUID[] NOT NULL DEFAULT '{}',
 "idempotencyKey" UUID,
 "requestHash" CHAR(64),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("action" = 'EMPLOYEE_IMPORT' AND "idempotencyKey" IS NOT NULL AND "requestHash" IS NOT NULL) OR ("action" <> 'EMPLOYEE_IMPORT' AND "idempotencyKey" IS NULL AND "requestHash" IS NULL))
);
CREATE UNIQUE INDEX "EmployeeAdministrationEvent_actorUserId_idempotencyKey_key" ON "EmployeeAdministrationEvent"("actorUserId","idempotencyKey");
CREATE INDEX "EmployeeAdministrationEvent_targetEmployeeId_createdAt_idx" ON "EmployeeAdministrationEvent"("targetEmployeeId","createdAt");
CREATE FUNCTION employee_administration_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Employee administration audit is append-only'; END; $$;
CREATE TRIGGER employee_administration_audit_immutable BEFORE UPDATE OR DELETE ON "EmployeeAdministrationEvent" FOR EACH ROW EXECUTE FUNCTION employee_administration_audit_immutable();
CREATE TRIGGER employee_administration_audit_no_truncate BEFORE TRUNCATE ON "EmployeeAdministrationEvent" FOR EACH STATEMENT EXECUTE FUNCTION employee_administration_audit_immutable();
