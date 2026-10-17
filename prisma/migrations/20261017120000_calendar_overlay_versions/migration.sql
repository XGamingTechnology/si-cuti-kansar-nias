CREATE TABLE "CalendarOverlayVersion" (
  "id" UUID NOT NULL PRIMARY KEY,
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 1900 AND 9999),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "sourceReference" VARCHAR(500) NOT NULL CHECK (length(btrim("sourceReference"))>0),
  "sourcePublishedOn" DATE NOT NULL,
  "sourceUrl" VARCHAR(1000) NOT NULL,
  "events" JSONB NOT NULL CHECK (jsonb_typeof("events")='array' AND jsonb_array_length("events") BETWEEN 1 AND 500),
  "checksum" CHAR(64) NOT NULL,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL
);
CREATE UNIQUE INDEX "CalendarOverlayVersion_year_version_key" ON "CalendarOverlayVersion"("year","version");
CREATE UNIQUE INDEX "CalendarOverlayVersion_idempotencyKey_key" ON "CalendarOverlayVersion"("idempotencyKey");
CREATE FUNCTION reject_calendar_overlay_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Calendar overlay versions are append-only'; END;
$$;
CREATE TRIGGER "CalendarOverlay_append_only" BEFORE UPDATE OR DELETE ON "CalendarOverlayVersion"
FOR EACH ROW EXECUTE FUNCTION reject_calendar_overlay_mutation();
