# M3 Batch 2 — Leave Balance Persistence Foundation

This batch adds persistence only for the approved M3 balance decisions. It does not add a leave
request, workflow, approval authority, document authority, route, Server Action, or user interface.

## Audit and transaction boundary

`AnnualBalanceOperation` is the auditable business history. The normal balance repository exposes
only `append` for ledger rows; it intentionally exposes no update or delete operation. PostgreSQL
role-level denial of `UPDATE`/`DELETE` is not installed by the migration because the current shared
application database role also performs migrations and integration-test cleanup. Consequently,
append-only behavior is enforced at the repository/application business boundary. Corrections must
be represented by a new `REVERSAL` or `ADJUSTMENT` row.

`PrismaAnnualBalanceRepository.withLockedAccounts` opens one PostgreSQL transaction, selects the
requested employee/year account rows in the Batch 1 bucket order with `FOR UPDATE`, and supplies
only counter-update and ledger-append operations inside that transaction. The primitive establishes
the atomic boundary for the later M3 Batch 3 mutation service; allocation policy remains in the
domain layer.

## Integration-test safety

The persistence suite runs only when `DATABASE_URL` is explicitly present and is intended for a
disposable PostgreSQL database to which all migrations have first been deployed. It creates only
synthetic `TEST-*` employees and `Uji M3` catalog records and removes them after each test. It must
never be pointed at staging or production.
