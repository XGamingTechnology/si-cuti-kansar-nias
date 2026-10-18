CREATE TABLE "UserAvatar" (
 "userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),"storageKey" VARCHAR(32),checksum CHAR(64),mime VARCHAR(20),width INTEGER,height INTEGER,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT avatar_content CHECK (("storageKey" IS NULL AND checksum IS NULL AND mime IS NULL AND width IS NULL AND height IS NULL) OR ("storageKey" IS NOT NULL AND checksum IS NOT NULL AND mime IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND "storageKey" ~ '^[a-f0-9]{32}$' AND checksum ~ '^[a-f0-9]{64}$' AND mime IN ('image/jpeg','image/png') AND width BETWEEN 1 AND 512 AND height BETWEEN 1 AND 512))
);
CREATE UNIQUE INDEX "UserAvatar_storageKey_key" ON "UserAvatar"("storageKey");
CREATE TABLE "AvatarOperation" (
 id UUID PRIMARY KEY,"actorUserId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "idempotencyKey" UUID NOT NULL,"payloadHash" CHAR(64) NOT NULL,action VARCHAR(10) NOT NULL CHECK(action IN ('UPLOAD','REPLACE','DELETE')),
 "resultVersion" INTEGER NOT NULL CHECK("resultVersion">0),"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AvatarOperation_actorUserId_idempotencyKey_key" ON "AvatarOperation"("actorUserId","idempotencyKey");
CREATE FUNCTION avatar_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Avatar audit is append-only'; END $$;
CREATE TRIGGER avatar_operation_immutable BEFORE UPDATE OR DELETE ON "AvatarOperation" FOR EACH ROW EXECUTE FUNCTION avatar_audit_immutable();
CREATE TRIGGER avatar_operation_no_truncate BEFORE TRUNCATE ON "AvatarOperation" FOR EACH STATEMENT EXECUTE FUNCTION avatar_audit_immutable();
