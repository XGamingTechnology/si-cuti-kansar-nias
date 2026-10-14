# Staging checkpoint, 15 October 2026 WIB

This record summarizes operator-supplied terminal evidence and user feedback from the rollout.
The assistant reviewed the output; it did not directly access the VPS. Public health and exhaustive
UAT checks are distinguished from the internal checks that actually passed.

## Source and image provenance

- Repository: `XGamingTechnology/si-cuti-kansar-nias`.
- PR #105 merge: `193be89ab91fe2fb4b082d8fe0f08152c5e85dcf`.
- PR #106 merge and fetched staging ref: `f6be359adddac8e518dea95e20841e42a8cccd0e`.
- Clean detached build worktree: `/opt/si-cuti-env/builds/f6be359`.
- Runtime ref: `si-cuti:app-f6be359`.
- Runtime image ID: `sha256:a45aeb9b5ff84ea82520fea228f060ff0d600dbcd58b0601593f7d6ad42ffefb`.
- Migrator ref: `si-cuti-migrator:f6be359`.
- Migrator image ID: `sha256:f905df7fa5cbea40cb23ae66d0b8d20e774fd02707c4709c1bb6ea676f4dac41`.
- Both images carry OCI revision `f6be359adddac8e518dea95e20841e42a8cccd0e`.

The operational checkout `/opt/si-cuti-env/staging` remains separate from the clean build worktree.
Earlier evidence showed local edge-template/Compose modifications and untracked backups/junk.
No reset or cleanup was performed. The rollout verified the two application Compose files were
unmodified and matched the target commit before using them.

## Checks that passed

- Project `si-cuti-staging`; `.env.staging` permission 600; no credentials printed.
- App role `si_cuti_staging_app`, migrator role `si_cuti_staging_migration`, host `postgres`,
  port 5432, database `si_cuti_staging` and marker `si_cuti_staging|staging`.
- Actual database volume `si-cuti-staging_postgres_data`, mounted at `/var/lib/postgresql`.
- Actual document volume `si-cuti-staging_private_documents`, mounted at `/var/lib/si-cuti/documents`.
- Environment guard succeeded; old app and PostgreSQL were healthy before the update.
- Applied migration history matched source SHA-256 checksums; exactly
  `20261015100000_leave_decision_editions` was pending.
- App stopped while database/documents backups were captured. Dump was non-empty and its TOC
  readable by `pg_restore --list`; document tar listing succeeded. Checksums were recorded.
- Prisma reported 11 migrations and successfully applied the new edition migration.
- New-table SELECT/INSERT/UPDATE/DELETE privileges for the app role passed individually.
- App/migrator refs updated; app alone recreated without dependencies, build or pull.
- Running app image ID matched the expected image; PostgreSQL container ID was unchanged.
- App healthy; internal `/api/health/live` and `/api/health/ready` returned HTTP 200.
- Script completed with `ROLLOUT_F6BE359_OK`; no rollback path ran.

Backup directory: `/opt/si-cuti-env/backups/staging/f6be359-20261014T180629Z`.
The timestamp is UTC; the rollout occurred on 15 October locally in WIB. The backup includes
database/documents, checksums, pre-rollout env/image refs and migration history. Secret env contents
are not part of this record. This was a backup readability check, not a full restore test or off-VPS DR.

## Feature acceptance and residual checks

After rollout, the user said “Udah oke sih lanjut masalah issue issue selanjutnya”. This records
positive scoped feedback on the current result. It does not establish that every acceptance case ran.

- Verify public HTTPS live/ready; commands were supplied but their output was not received.
- Admin: preview marker placement, keep signatures readable, verify source identity/period,
  save edition and download latest/previous versions. Original scan remains unchanged.
- Rejection reason/time come from the immutable decision; marker is a SI CUTI record marker,
  not a fabricated formal signature, official seal or second approval for both VII and VIII.
- Full UAT still includes owner isolation, retries, rotated/cropped scans, mobile/focus, and
  switching between requests without stale feedback. Local mocked browser checks are not DB E2E.
- Annual returns after downstream committed rollover remain unsupported; original APPROVED
  requests/COMMIT history stay intact. No production deployment took place.

CI for PR #106: [Quality Gate run 38606910543](https://github.com/XGamingTechnology/si-cuti-kansar-nias/actions/runs/38606910543),
377 unit/HTTP tests, 92 PostgreSQL integration tests, migrations and build passed. Twelve local
isolated React/Chromium scenarios used synthetic intercepted APIs. Those checks describe the
feature PR, not new test execution for this documentation-only checkpoint.
