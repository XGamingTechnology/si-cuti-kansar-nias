# Final decision archives and annual-leave returns

Implementation scope for the user's instruction on 14 October 2026: “Oke dari semua isu tadi ayo kita perbaiki”.
This candidate implements the Admin/manual first-phase recommendations discussed in Issue #104 and the user's
explicit direction to create a new approved/rejected PDF from the employee-uploaded source. It does
not invent official letter numbering, new approval roles or retroactive entitlement rules.

## Baseline and source review

Source branch staging at `5f6ff1d40e26a51948c7b7423ca4c5daa9373663`. AGENTS.md and its required
product documents were read; the original 10-page proposal PDF, including the hybrid workflow on
page 7, was also read locally. The proposal assigns archival upload to Admin; the current product
and the user's instruction explicitly use the Pegawai-uploaded signed scan. This candidate preserves that
current direction. BAL-002 and WF-003 authoritative amendments preserve compensating ledger history.

## Operational scope

Admin Kepegawaian records an authorized unused full-working-day count manually, with reason,
reference/date of the official basis, private supporting PDF and explicit verification attestation.
The server derives employee, entitlement year, original revision and COMMIT allocation. It validates
the technical remaining ceiling, reverses the still-effective original allocation, and records an
immutable event plus links in the same transaction. The ceiling does not prove actual non-use.

No Pegawai initiation workflow is introduced. Pegawai owners can read history and private files.
A year already feeding a later committed rollover is unsupported and requires a separate reviewed
correction process. Old-year amounts are never automatically credited to the current year. The
Employee row lock shared with rollover prevents a new reversal from silently racing a rollover.

## PDF outcomes

APPROVED produces a private derived PDF labelled FINAL - DISETUJUI DI SI CUTI, comprising a status
sheet and pages copied from the selected signed scan. REJECTED records its reason and produces
DITOLAK DI SI CUTI, with a source scan where available or a notice alone where none was uploaded.
The original scan bytes, checksum, signature and stamp are not overwritten. The archive uses an
internal record ID, not an invented official letter number or new digital signature.

A final decision pins source document/version/checksum and employee/period/actor/decision metadata
inside the workflow transaction. Multiple uploaded versions require an explicit approval selection.
Late uploads are rejected under the same request lock. Old approved requests without a historical
source pin remain unlabelled until Admin explicitly verifies the original source through the legacy
review action. That action preserves the old transition and ledger and records the reviewer/time;
missing historical names are not inferred from current employee data.

The SQL snapshot persists even if PDF rendering/storage fails. The UI reports the result PDF as not
ready; authenticated download can retry generation without reapplying the decision or balance
mutation. A unique artifact per archive makes concurrent generation idempotent; unused competing
stored files are cleaned up. PDF rendering uses pdf-lib/fontkit and a licensed bundled DejaVu Sans
font for Indonesian text, accents and punctuation. See public/fonts/DejaVu-LICENSE.txt.

## API

- GET /api/workflow/leave/:id/decision: snapshot and exact source ID, never storage keys.
- POST /api/workflow/leave/:id/decision: explicit Admin review of a legacy decision source.
- GET /api/workflow/leave/:id/decision/document: authenticated result PDF; retry missing artifact.
- GET /api/workflow/leave/:id/returns: immutable return history for Admin/owner.
- POST /api/workflow/leave/:id/returns/evidence: Admin upload of RETURN_BASIS PDF.
- POST /api/workflow/leave/:id/returns/preview: no balance mutation.
- POST /api/workflow/leave/:id/returns: apply normalized payload + stable idempotencyKey + fingerprint.

The preview fingerprint binds the original allocation, previous reversals, account counters,
normalized input and evidence checksum. Both preview and apply verify the private evidence bytes
against their checksum; the audit snapshot retains the attestation and evidence checksum. Stale or
modified previews return 409. Retry lookup precedes
remaining-ceiling/rollover validation, so a successful historical command can still be replayed.

## Verification and rollout

Run lint/typecheck/unit+HTTP/build, plus PostgreSQL integration with
SI_CUTI_DISPOSABLE_TEST_DB=1 against a disposable database. CI supplies PostgreSQL 18 and a
non-superuser test role. Integration files run serially because the existing Admin-recovery
fixtures temporarily change the global Admin population. Concurrent return/rollover scenarios
still run simultaneous commands inside each test. Do not point integration fixtures at staging
or production.

Migration `20261014120000_leave_decision_archives_and_returns` only adds entities, indexes,
constraints and RETURN_BASIS; deployed migrations are immutable. Before rollout, review the SQL,
backup staging, run the environment guard, apply the new migration explicitly, then deploy matching
app/migrator versions and perform UAT. This is not an app-only release. No VPS deployment is performed
by this candidate. Use synthetic data for browser scenarios.

## Local verification recorded 2026-10-14

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 365 unit/HTTP tests passed across 35 files.
- `npm run build`: production build passed, including all new API routes.
- `tests/browser/leave-records-ui.mjs`: 9 isolated React/Chromium scenarios passed with synthetic
  intercepted API responses. These do not validate the real database/API end-to-end.
- Approved/rejected sample PDFs were rendered and visually inspected; source-page orientation and
  Unicode rejection text are covered by automated tests.
- GitHub Quality Gate run #44 passed: all migrations applied on disposable PostgreSQL 18,
  92 integration tests passed across 15 files, and production build passed. The job uses a
  non-superuser test role; this is not staging migration/UAT verification.
  [CI verification](https://github.com/XGamingTechnology/si-cuti-kansar-nias/actions/runs/38518532477).
- Staging UAT remains pending. PostgreSQL tests were run by CI, not in the local workspace.
- Published for review in PR #105. No deployment has been performed.

Browser test command (with an installed Playwright/Chromium runtime):

```sh
SI_CUTI_PLAYWRIGHT_MODULE=/path/to/playwright \
SI_CUTI_CHROMIUM_EXECUTABLE=/path/to/chromium \
node tests/browser/leave-records-ui.mjs
```

## Changed files

The complete patch targets the staging baseline stated above. The following files contain the
implementation, documentation and checks:

- `.github/workflows/quality.yml`
- `docs/implementation-plan.md`
- `docs/leave-records-decisions.md`
- `docs/requirement-traceability.md`
- `package-lock.json`
- `package.json`
- `prisma/migrations/20261014120000_leave_decision_archives_and_returns/migration.sql`
- `prisma/schema.prisma`
- `public/fonts/DejaVu-LICENSE.txt`
- `public/fonts/DejaVuSans.ttf`
- `src/app/api/workflow/leave/[id]/decision/document/route.ts`
- `src/app/api/workflow/leave/[id]/decision/route.ts`
- `src/app/api/workflow/leave/[id]/returns/evidence/route.ts`
- `src/app/api/workflow/leave/[id]/returns/preview/route.ts`
- `src/app/api/workflow/leave/[id]/returns/route.ts`
- `src/application/leave-balance/service.ts`
- `src/application/leave-documents/ports.ts`
- `src/application/leave-documents/service.ts`
- `src/application/leave-records/decision-pdf.ts`
- `src/application/leave-records/delivery.ts`
- `src/application/leave-records/ports.ts`
- `src/application/leave-records/service.ts`
- `src/application/workflow/delivery.ts`
- `src/application/workflow/http.ts`
- `src/application/workflow/leave-service.ts`
- `src/application/workflow/ports.ts`
- `src/components/admin-employee-ui.css`
- `src/components/admin-floating-window.tsx`
- `src/components/leave-outcome-panel.tsx`
- `src/components/workflow-workspace.tsx`
- `src/infrastructure/leave-documents/prisma-leave-document-repository.ts`
- `src/infrastructure/leave-records/prisma-repository.ts`
- `src/infrastructure/workflow/prisma-workflow-repository.ts`
- `src/infrastructure/workflow/runtime.ts`
- `tests/browser/leave-records-ui.mjs`
- `tests/http/leave-records-delivery.test.ts`
- `tests/integration/leave-records-postgresql.test.ts`
- `tests/integration/workflow-services-postgresql.test.ts`
- `tests/unit/leave-records.test.ts`
- `tests/unit/workflow-services.test.ts`
