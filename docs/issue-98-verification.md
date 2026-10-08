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
