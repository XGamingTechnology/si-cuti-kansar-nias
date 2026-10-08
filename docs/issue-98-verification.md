# Issue #98 — Implementation verification

Date: 2026-10-08. Repository: `XGamingTechnology/si-cuti-kansar-nias`.
Branch: `codex/batch-annual-balance-import`.
Starting commit: `374fb1bfcf5dc4fdc4109ad37a90ed0864a5f416`.

## Delivered behavior

Admin-only prefilled XLSX template, read-only preview with row diagnostics, explicit confirmation, per-employee atomic batch commit, safe retry, and downloadable CSV results on `/admin/saldo-cuti`. The single initializer supplies the shared opening values/validation and locked transactions. Initialized balances are skipped; PARTIAL/invariant sets are rejected. No lifecycle change, schema/dependency upgrade, migration, overwrite, or deployment.

The CSV result download escapes spreadsheet formula prefixes. XLSX import rejects formulas and bounds upload size, expanded archive size, worksheet coordinates, and data-row count. Template NIP/name cells are text, not numeric/formula cells.

## Gates and evidence

| Gate                                                | Result                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                      | PASS                                                                                                                                                                                                                                                         |
| `npm run typecheck`                                 | PASS; Prisma 7.4.2 client generated normally with verified engine download                                                                                                                                                                                   |
| `npm test`                                          | PASS; 32 files, 319 unit/HTTP tests                                                                                                                                                                                                                          |
| `npm run test:integration -- --no-file-parallelism` | PASS; 14 files, 79 PostgreSQL tests; no skipped tests                                                                                                                                                                                                        |
| New batch suites                                    | PASS; 25 unit + 8 HTTP + 5 integration tests                                                                                                                                                                                                                 |
| Single-initialization regression                    | PASS; 13 unit + 12 HTTP + 3 integration tests                                                                                                                                                                                                                |
| Annual/workflow regressions                         | PASS; existing mutation, rollover, allocation, working-day, persistence and workflow suites included in full gates                                                                                                                                           |
| `npm run build`                                     | PASS; optimized Next.js build includes all three batch routes                                                                                                                                                                                                |
| Built application smoke                             | PASS; actual HTTP requests with synthetic Admin/Pegawai database sessions: page, template attachment, 401/403 denial, preview without writes, batch commit, same-batch retry, authenticated actor in ledger, detail refresh, and existing single initializer |
| Independent XLSX reader                             | PASS; Python ZIP CRC/XML checks and openpyxl read generated workbook, preserving long zero-prefixed NIP text                                                                                                                                                 |
| `git diff --check`                                  | PASS                                                                                                                                                                                                                                                         |
| Schema/migration/dependency diff                    | EMPTY (`prisma/`, `package.json`, `package-lock.json`)                                                                                                                                                                                                       |

Database: disposable Docker `postgres:18.1`, verified `18.1 (Debian 18.1-1.pgdg13+2)`, isolated local port, database `si_cuti_issue98`. Application/integration/smoke role: `si_cuti_issue98_app`, verified NOSUPERUSER/NOCREATEDB/NOCREATEROLE. Existing nine migrations applied only to this disposable database. Bootstrap role provisions schema; all application tests use the non-superuser role. Test and smoke fixtures contain only synthetic employee data.

Concurrency and rollback tests use real PostgreSQL transactions. Concurrent retries issue exactly one opening account set and one set of positive GRANTs per employee. A forced duplicate idempotency key in the middle of a row rolls back that row's account/ledger inserts, while another employee can succeed.

## Verification adjustments

- Prisma and GitHub API access initially failed through the network proxy. The saved environment network draft adds `binaries.prisma.sh` and `api.github.com`, preserving existing presets. Live access subsequently became usable; normal Prisma generation/migration commands and all final gates succeeded. Checksum/TLS verification was retained.
- The legacy workflow integration fixture lacked the form location/address/phone and signed-document metadata now required by existing submission/approval code. Only synthetic fixture prerequisites and cleanup were updated; production workflow code and test assertions were preserved.
- Integration files run sequentially because the auth-recovery fixture changes global Admin state and interferes with concurrent provisioning suites. Individual concurrency tests still execute simultaneous transactions and requests.
- Next.js rewrites its generated type declaration and TypeScript includes during builds. Those incidental tracked-file changes are restored before commit.
- The current ledger has no actor column. Batch GRANT keys retain the authenticated Admin UUID plus batch/employee/year/bucket correlation, without a schema change. The original row reason and employee/year-scoped OPENING_BALANCE reference are retained.

## Exact changed files

- `docs/annual-balance-batch-import.md`
- `docs/issue-98-verification.md`
- `src/app/api/admin/annual-balances/batch/commit/route.ts`
- `src/app/api/admin/annual-balances/batch/handlers.ts`
- `src/app/api/admin/annual-balances/batch/preview/route.ts`
- `src/app/api/admin/annual-balances/batch/template/route.ts`
- `src/app/styles.css`
- `src/application/leave-balance/administration.ts`
- `src/application/leave-balance/batch-import.ts`
- `src/components/annual-balance-import.tsx`
- `src/components/annual-balance-management.tsx`
- `src/infrastructure/employees/xlsx-workbook-reader.ts`
- `src/infrastructure/leave-balance/prisma-annual-balance-administration-repository.ts`
- `src/infrastructure/leave-balance/runtime.ts`
- `src/infrastructure/leave-balance/xlsx-balance-template.ts`
- `tests/http/annual-balance-batch-import.test.ts`
- `tests/integration/annual-balance-batch-import.test.ts`
- `tests/integration/workflow-services-postgresql.test.ts`
- `tests/support/annual-balance-batch.ts`
- `tests/unit/annual-balance-batch-import.test.ts`

## PR #99 — Granted-entitlement review correction (2026-10-08)

The initial implementation record above refers to commit `c8cd4b7ca58081adf6f868ee8da892aa44083b24`. This review correction changes only the two entitlement-cap checks in `annualBalanceReadiness()`: bucket limits and the regular 24-day sum now use `grantedDays`, not `availableDays`. N <=12, N1 <=6, N2 <=6, and regular granted entitlement <=24 remain the approved limits. JOINT_LEAVE_CLAIM remains excluded. Existing integer/nonnegative counter checks, reserved+committed <=granted, and available=granted-reserved-committed are unchanged.

Regression cases cover N1 granted 7/committed 2/available 5, N2 granted 7/reserved 2/available 5, N granted 13/committed 1/available 12, and regular granted 25/committed 2/available 23. Every regular available bucket and available total remains within its cap in these fixtures. These previously passed readiness validation; they now produce PARTIAL. Legitimate used/reserved balances still produce INITIALIZED, and a legitimate regular entitlement of 24 plus a Claim entitlement of 10 remains INITIALIZED.

Direct readiness/service tests also preserve empty, missing, duplicate/incomplete bucket, negative counter, overspent counter, inconsistent availability, and fractional counter detection. Batch tests prove invalid sets produce ERROR and stale-preview commit produces FAILED without account or ledger changes. PostgreSQL tests persist all four malformed sets and prove both batch commit and single initialization reject them without repair or overwrite. A valid reserved account set remains initialized and is skipped unchanged.

Before the production fix, the new focused unit tests failed in 8 cases (4 direct readiness, 4 batch preview); the other 47 unit tests passed. All final gates below pass after the two-line fix:

| Review gate                                                          | Result                                             |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| Prettier on all six changed files                                    | PASS                                               |
| `npm run typecheck`                                                  | PASS                                               |
| `npm run lint`                                                       | PASS                                               |
| Focused annual-balance unit + batch unit + annual-balance HTTP tests | PASS; 75 tests (26 + 29 + 12 + 8) across 4 files   |
| `npm test`                                                           | PASS; 336 unit/HTTP tests across 32 files          |
| `npm run test:integration -- --no-file-parallelism`                  | PASS; 84 tests across 14 files, no skipped tests   |
| Batch PostgreSQL suite                                               | PASS; 10 tests, including 5 new review regressions |
| `git diff --check`                                                   | PASS                                               |
| Schema, migration and dependency diff from supplied PR head          | EMPTY                                              |

Integration database: disposable PostgreSQL 18.1 (`si_cuti_review99`), non-superuser role `si_cuti_review99_app`. Only the existing nine migrations were applied to this disposable database. File-level serialization preserves test isolation while concurrency checks inside tests remain active.

No schema, migration, dependency, lifecycle-rule changes, balance-editing path, or deployment were introduced. The earlier build/smoke record pertains to the original implementation; this correction is verified by the review gates above.

Exact files changed by this review correction:

- `src/application/leave-balance/administration.ts`
- `tests/unit/annual-balance-administration.test.ts`
- `tests/unit/annual-balance-batch-import.test.ts`
- `tests/integration/annual-balance-batch-import.test.ts`
- `tests/support/annual-balance-batch.ts`
- `docs/issue-98-verification.md`
