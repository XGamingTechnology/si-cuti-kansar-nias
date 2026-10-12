ALTER TABLE "LeaveRequestRevision"
  ADD COLUMN "directSupervisorSnapshotCaptured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "directSupervisorIdSnapshot" UUID,
  ADD COLUMN "directSupervisorNipSnapshot" VARCHAR(32),
  ADD COLUMN "directSupervisorNameSnapshot" VARCHAR(200),
  ADD COLUMN "directSupervisorTitleSnapshot" VARCHAR(200);

ALTER TABLE "LeaveRequestRevision"
  ADD CONSTRAINT "LeaveRequestRevision_direct_supervisor_snapshot_consistent"
  CHECK (
    (
      "directSupervisorSnapshotCaptured" = false
      AND "directSupervisorIdSnapshot" IS NULL
      AND "directSupervisorNipSnapshot" IS NULL
      AND "directSupervisorNameSnapshot" IS NULL
      AND "directSupervisorTitleSnapshot" IS NULL
    )
    OR
    (
      "directSupervisorSnapshotCaptured" = true
      AND (
        (
          "directSupervisorIdSnapshot" IS NULL
          AND "directSupervisorNipSnapshot" IS NULL
          AND "directSupervisorNameSnapshot" IS NULL
          AND "directSupervisorTitleSnapshot" IS NULL
        )
        OR
        (
          "directSupervisorIdSnapshot" IS NOT NULL
          AND "directSupervisorNipSnapshot" IS NOT NULL
          AND "directSupervisorNameSnapshot" IS NOT NULL
          AND "directSupervisorTitleSnapshot" IS NOT NULL
        )
      )
    )
  );
