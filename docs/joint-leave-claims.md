# Klaim Cuti Bersama, Issue #107

Implementation candidate based on staging `f6be359adddac8e518dea95e20841e42a8cccd0e`.
The user supplied rules on 16 October 2026 WIB and then approved the three concrete recommendations
with “Gas lanjut”: separate optional Sprin number, explicit Admin-selected credit year for
Natal/Tahun Baru, and resubmission after rejection without reopening or overwriting the old claim.
This document records product decisions, not a newly verified legal interpretation or a deployment.

## Source and operational decisions

AGENTS.md, its seven required product documents, BAL-005, and the original proposal PDF were reviewed.
Proposal pages 5–7 describe employee evidence/photo upload, Admin verification, annual-balance credit
after approval and Claim-first deduction. Detailed product amendments take precedence over earlier
proposals in Issue #107. No government holiday calendar or quota is inferred or automatically imported.

- Admin creates eligible dates and a source reference, credit year and cumulative annual per-employee
  ceiling. A new configuration is an immutable prospective version; existing claims retain its snapshot.
  Publishing retires the older version's active flag for new submissions under a year-scoped lock;
  older versions remain visible and existing claims keep their original snapshot. Other policy content
  is not edited/deleted or used to reclassify old decisions.
- Every candidate date has a group: REGULAR requires event year = credit year; YEAR_END allows
  December immediately before credit year or January in credit year. Example: eligible Christmas
  December 2025 and New Year January 2026 credit to 2026. Admin verifies the actual official dates;
  selecting YEAR_END does not itself establish a date's legal eligibility.
- New operational policies use the entire credit year in WIB. Submission and positive approval must
  occur in that credit year; year-end late approval/back-credit is not automatically supported.
- Pegawai selects one or more dates from one policy version, assignment type Siaga Khusus/Ops/
  Siaga Rutin or Sprin Penugasan (user amendment, 27 October 2026), title and private evidence.
  Sprin number remains separate optional metadata for every assignment type.
  The UI requires a fresh evidence upload for a new claim; it never reuses a rejected claim's bytes silently.
- Submit goes directly to SUBMITTED; no new DRAFT/RETURNED_FOR_CORRECTION lifecycle is introduced.
  Admin records a final per-date review under compatible BAL-005 partial-approval support. Incomplete
  or invalid evidence is rejected. Unselected dates are rejected with the recorded explanation.
  At least one approved date gives parent APPROVED with partial wording; no approved dates gives REJECTED.
- Pending or approved employee/date pairs block another claim across policy IDs and credit years.
  REJECTED dates free the live slot but their rows/reason/evidence remain immutable business history.
  Ajukan Ulang dengan Perbaikan prefills a new form; it does not edit the old decision.
- One approved event date grants one full day. The server derives employee, date, creditYear and bucket.
  The employee cannot choose a number of credited days or edit the credit year through the claim payload.
- The configured ceiling is checked against all approved date records in the credit year, including
  other policy versions. Spending or reversing annual leave does not reopen that claim ceiling.
  A prospective policy with a different ceiling requires Admin/source provenance, not an automatic top-up.
  The maximum 366 input rows is a technical request bound, not a government entitlement.

## Year-bound balance and existing engine

Approved days GRANT the existing JOINT_LEAVE_CLAIM account. Accounts must already be fully initialized;
the service does not initialize N/N1/N2/Claim or repair PARTIAL sets while approving. A year that feeds
a committed downstream rollover is blocked for a separate correction review.

Claim remains part of total Cuti Tahunan and first in priority. It stays outside the regular
N+N1+N2 <= 24 cap, as in BAL-005; the user's “part of annual leave” statement does not amend that cap.

Rollover already creates the next year's Claim at zero. The new reserve guard excludes a Claim
account when its entitlement year differs from the server operation's WIB year, including retroactive
requests or future-dated leave. Old account counters/GRANT/COMMIT/REVERSAL are retained, not overwritten
with a synthetic reset. Existing reservation retries remain idempotent; this does not cancel old requests.

## Persistence, integrity and concurrency

Forward migration `20261016090000_joint_leave_claims` adds JointLeaveClaim and JointLeaveClaimDate,
policy creator/command metadata and event group. Old policy rows remain valid through nullable/default
additions. All previous migrations remain byte-identical.

Claim metadata stores submitted actor/time, employee identity snapshot, immutable policy/event selection,
assignment/Sprin/title, evidence MIME/size/SHA-256 and private storage key, stable submission UUID/hash.
Final review stores Admin/time/reason, preview/balance/evidence/attestation snapshot and stable UUID/hash.
Each approved date has a unique FK link to its GRANT. Composite restrictive FKs bind child date rows to
their claim employee/policy and event policy. Status/size/assignment checks and a partial unique index
on employee+eventDate for PENDING/APPROVED enforce key invariants in PostgreSQL.

Submit/review lock Employee first; reviews then lock accounts in existing Claim/N2/N1/N order. This
shares the Employee lock with rollover and avoids checking a cumulative quota outside its lock.
Claim dates, GRANTs, counters and review/audit are committed in one transaction. A forced review-write
failure must roll them all back. Counter changes after preview require a new fingerprint; identical
confirmed retries replay the prior result even after year boundaries. Different actor/payload keys conflict.

Evidence storage is outside SQL. A failed submission or concurrent replay deletes its unused new file;
the winning claim keeps its pinned file. File storage failure cleanup follows the existing private-storage
boundary; this feature does not claim an orphan-file sweeper or distributed SQL/filesystem transaction.

PDF/JPEG/PNG, 10 MB per file, one evidence file per submission is the technical first-phase contract.
PDF is parsed, must be unencrypted and have 1–100 pages. Images are parsed with a 40-million-pixel bound;
PNG dimensions are bounded before decoding. MIME/extension alone is not trusted. Multipart/JSON streams
are bounded before parsing. These checks are not malware scanning or authenticity/e-signature verification.
Admin still checks the actual task, period and evidence content.

## API and access

- GET/POST `/api/joint-leave`: owner/Admin list, Pegawai-only multipart submit.
- GET/POST `/api/joint-leave/policies`: authenticated policy list; Admin-only immutable configuration.
- GET `/api/joint-leave/duplicates`: owner-only blocking-date notification.
- GET `/api/joint-leave/:id`: Admin/owner detail, explicit public field allowlist.
- GET `/api/joint-leave/:id/evidence[?download=1]`: authorized checksum-checked bytes,
  private/no-store, nosniff, sandbox and fixed generated filenames.
- POST `/api/joint-leave/:id/preview`: Admin, read-only review preview with fingerprint.
- POST `/api/joint-leave/:id/review`: Admin confirmed result, stable UUID and fingerprint.

Body validation rejects unknown authority fields, malformed IDs, impossible dates, duplicate selections,
missing reason/evidence/verification and oversize input. Error responses are sanitized Indonesian;
401/403/404/409/422 have distinct meanings. Owners cannot read other employee claims/evidence.

The authenticated `/klaim-cuti-bersama` page is in both sidebars. Lists have server pagination of 10,
year/status/search, current-year form, private evidence links, a visible rejection explanation and retry.
Dialogs reuse existing Escape/focus/mobile behavior. Review edits invalidate preview/confirmation;
network retries keep command keys. Admin sees configuration history and cumulative approval preview.

## Verification and rollout

Run lint, Prisma validate/generate/typecheck, unit/HTTP, production build, and PostgreSQL integration
on a disposable database with SI_CUTI_DISPOSABLE_TEST_DB=1. Integration must prove concurrent submission,
quota races, partial/reject/retry, immutable snapshots, private ownership, all-or-nothing rollback,
preview staleness and rollover zero carry. Browser scenarios in `tests/browser/joint-leave-ui.mjs`
use synthetic intercepted APIs; they are not DB E2E.

This candidate requires a reviewed schema migration and matching app/migrator images. Before staging:
backup database/private documents, guard environment/DB/volumes/roles, verify old migration checksums,
apply only the reviewed pending migration, verify app table privileges, deploy exact image and health/UAT.
No staging or production database was accessed during implementation. Public HTTPS, actual authenticated
browser UAT and operational evidence validation remain staging acceptance tasks.
