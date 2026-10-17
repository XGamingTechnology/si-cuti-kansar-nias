CREATE TABLE "ReportRun" (
 "id" UUID PRIMARY KEY,"actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 "idempotencyKey" UUID NOT NULL,"payloadHash" CHAR(64) NOT NULL,"reportCode" VARCHAR(30) NOT NULL,
 "definitionVersion" VARCHAR(50) NOT NULL,"rendererVersion" VARCHAR(50) NOT NULL,"filters" JSONB NOT NULL,
 "capturedAt" TIMESTAMPTZ(3) NOT NULL,"createdAt" TIMESTAMPTZ(3) NOT NULL,"expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "rowCount" INTEGER NOT NULL CHECK ("rowCount" BETWEEN 0 AND 1000),"datasetKey" VARCHAR(191) NOT NULL,
 "datasetChecksum" CHAR(64) NOT NULL,"datasetSize" INTEGER NOT NULL CHECK ("datasetSize" BETWEEN 1 AND 5242880),
 CONSTRAINT "ReportRun_lifetime" CHECK ("expiresAt"="createdAt"+INTERVAL '24 hours'),
 CONSTRAINT "ReportRun_code" CHECK ("reportCode" IN ('LEAVE_REQUESTS','PERMISSION_REQUESTS'))
);
CREATE UNIQUE INDEX "ReportRun_actorUserId_idempotencyKey_key" ON "ReportRun"("actorUserId","idempotencyKey");
CREATE INDEX "ReportRun_expiresAt_idx" ON "ReportRun"("expiresAt");
CREATE TABLE "ReportArtifact" (
 "id" UUID PRIMARY KEY,"runId" UUID NOT NULL REFERENCES "ReportRun"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 "actorUserId" UUID NOT NULL,"idempotencyKey" UUID NOT NULL,"format" VARCHAR(10) NOT NULL CHECK ("format" IN ('PDF','XLSX')),
 "rendererVersion" VARCHAR(50) NOT NULL,"storageKey" VARCHAR(191) NOT NULL,"checksum" CHAR(64) NOT NULL,
 "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 10485760),"createdAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "ReportArtifact_runId_format_key" ON "ReportArtifact"("runId","format");
CREATE UNIQUE INDEX "ReportArtifact_actorUserId_idempotencyKey_key" ON "ReportArtifact"("actorUserId","idempotencyKey");
CREATE TABLE "ReportExportRequest" (
 "id" UUID PRIMARY KEY,"actorUserId" UUID NOT NULL,"idempotencyKey" UUID NOT NULL,"runId" UUID NOT NULL,
 "format" VARCHAR(10) NOT NULL CHECK ("format" IN ('PDF','XLSX')),
 "artifactId" UUID NOT NULL REFERENCES "ReportArtifact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ReportExportRequest_actorUserId_idempotencyKey_key" ON "ReportExportRequest"("actorUserId","idempotencyKey");
CREATE TABLE "ReportAuditEvent" (
 "id" UUID PRIMARY KEY,"actorUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 "actorRole" VARCHAR(40) NOT NULL,"maintenanceRole" VARCHAR(100),"occurredAt" TIMESTAMPTZ(3) NOT NULL,
 "correlationId" UUID NOT NULL,"runId" UUID,"reportCode" VARCHAR(30),"definitionVersion" VARCHAR(50) NOT NULL,
 "event" VARCHAR(40) NOT NULL,"resultCode" VARCHAR(50) NOT NULL,"format" VARCHAR(10),"rowCount" INTEGER,
 "filters" JSONB NOT NULL,"datasetChecksum" CHAR(64),"artifactChecksum" CHAR(64)
);
CREATE INDEX "ReportAuditEvent_occurredAt_idx" ON "ReportAuditEvent"("occurredAt");
CREATE INDEX "ReportAuditEvent_runId_occurredAt_idx" ON "ReportAuditEvent"("runId","occurredAt");
CREATE FUNCTION m7_immutable_report() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_name text; eligible boolean := false;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
 IF TG_OP='DELETE' AND current_user=owner_name THEN
   IF TG_TABLE_NAME='ReportRun' THEN eligible := OLD."createdAt" <= statement_timestamp()-INTERVAL '90 days';
   ELSIF TG_TABLE_NAME='ReportArtifact' THEN eligible := OLD."createdAt" <= statement_timestamp()-INTERVAL '90 days';
   ELSIF TG_TABLE_NAME='ReportExportRequest' THEN SELECT r."createdAt" <= statement_timestamp()-INTERVAL '90 days' INTO eligible FROM public."ReportRun" r WHERE r.id=OLD."runId";
   END IF;
   IF eligible THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'M7 report metadata is immutable; retention is privileged and fixed at 90 days';
END $$;
CREATE TRIGGER report_run_immutable BEFORE UPDATE OR DELETE ON "ReportRun" FOR EACH ROW EXECUTE FUNCTION m7_immutable_report();
CREATE TRIGGER report_artifact_immutable BEFORE UPDATE OR DELETE ON "ReportArtifact" FOR EACH ROW EXECUTE FUNCTION m7_immutable_report();
CREATE TRIGGER report_export_request_immutable BEFORE UPDATE OR DELETE ON "ReportExportRequest" FOR EACH ROW EXECUTE FUNCTION m7_immutable_report();
CREATE FUNCTION m7_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
 IF TG_OP='DELETE' AND current_user=owner_name AND OLD."occurredAt" <= statement_timestamp()-INTERVAL '90 days' THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'M7 audit is append-only; retention is privileged and fixed at 90 days';
END $$;
CREATE TRIGGER report_audit_immutable BEFORE UPDATE OR DELETE ON "ReportAuditEvent" FOR EACH ROW EXECUTE FUNCTION m7_audit_immutable();
-- Only an explicitly authorized maintenance login may execute this function. It accepts no cutoff,
-- cannot purge recent rows, and does not grant the web role general DELETE or trigger bypass.
CREATE FUNCTION m7_purge_report_audit() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE deleted integer; runs_deleted integer;
BEGIN
 DELETE FROM public."ReportAuditEvent" WHERE "occurredAt" <= statement_timestamp()-INTERVAL '90 days';
 GET DIAGNOSTICS deleted = ROW_COUNT;
 -- File bytes are already expired and purged independently. Metadata contains redacted filters only.
 -- Do not delete a manifest while a younger artifact still needs its 90-day metadata retention.
 DELETE FROM public."ReportExportRequest" c WHERE c."runId" IN (SELECT r.id FROM public."ReportRun" r WHERE r."createdAt" <= statement_timestamp()-INTERVAL '90 days' AND NOT EXISTS (SELECT 1 FROM public."ReportArtifact" a WHERE a."runId"=r.id AND a."createdAt">statement_timestamp()-INTERVAL '90 days'));
 DELETE FROM public."ReportArtifact" a WHERE a."createdAt"<=statement_timestamp()-INTERVAL '90 days' AND a."runId" IN (SELECT r.id FROM public."ReportRun" r WHERE r."createdAt"<=statement_timestamp()-INTERVAL '90 days' AND NOT EXISTS (SELECT 1 FROM public."ReportArtifact" recent WHERE recent."runId"=r.id AND recent."createdAt">statement_timestamp()-INTERVAL '90 days'));
 DELETE FROM public."ReportRun" r WHERE r."createdAt"<=statement_timestamp()-INTERVAL '90 days' AND NOT EXISTS (SELECT 1 FROM public."ReportArtifact" a WHERE a."runId"=r.id);
 GET DIAGNOSTICS runs_deleted = ROW_COUNT;
 INSERT INTO public."ReportAuditEvent" ("id","actorRole","maintenanceRole","occurredAt","correlationId","definitionVersion","event","resultCode","rowCount","filters")
 VALUES (gen_random_uuid(),'MAINTENANCE',session_user,statement_timestamp(),gen_random_uuid(),'m7-operational-v1','AUDIT_RETENTION','OK',deleted,jsonb_build_object('runsPurged',runs_deleted));
 RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION m7_purge_report_audit() FROM PUBLIC;
-- New-table default grants may include UPDATE/DELETE. Remove those rights from non-owner grantees
-- for the audit table; do not alter privileges of any existing domain table or default grants.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='ReportAuditEvent' AND privilege_type IN ('UPDATE','DELETE') AND grantee<>current_user LOOP
   EXECUTE format('REVOKE UPDATE, DELETE ON public."ReportAuditEvent" FROM %I',r.grantee);
 END LOOP;
END $$;
