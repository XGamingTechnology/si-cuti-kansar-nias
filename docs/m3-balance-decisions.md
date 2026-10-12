# SI CUTI — M3 Leave Balance Decision Amendment

Status: **AUTHORITATIVE RULE ALIGNMENT 2.2 — REQUIRED BEFORE M3 BATCH 3**
Scope: **BAL-001 through BAL-005**

## 1. Authority, supersession, and scope

This document is the authoritative amendment for the current M3 baseline. Rule Alignment 2.2 supersedes Rule Alignment 2.1 only where this document changes N-2 lifecycle and the 24-day regular-balance cap. All other Rule Alignment 2.1 decisions remain in force.

The old wording remains visible in Git and `docs/decision-log.md` as historical decision-log context; it is not a supported business rule where it conflicts with this document.

This alignment supplies domain and persistence foundations only. It does not implement LeaveRequest, employee Joint Leave claim workflow, claim evidence storage, API, UI, notification, reporting, approval hierarchy, or an M4 state machine. M3 remains in progress.

The M3 Batch 2 migration has already been applied to official staging. It must not be rewritten. Any future schema change must use a new forward migration.

## 2. Approved decisions

### BAL-001 — Balance reservation and commit

For Cuti Tahunan, reserve required days atomically on submission and commit them when Admin Kepegawaian declares the final administrative file complete. Reserved days cannot be double-spent. Workflow authority remains M4 scope.

### BAL-002 — Release, reversal, and authorized deferral

A rejected/cancelled reservation is released. An unused part of an already committed Cuti Tahunan period may be returned when interrupted/deferred by official assignment or another authorized basis.

The return must reference the original committed allocation, may cover only authorized unused days, and reconstructs that allocation in reverse order. It creates append-only compensating `REVERSAL` operations referencing original `COMMIT` operations; original rows are never edited or deleted.

Example: a seven-day COMMIT allocated 2 JOINT_LEAVE_CLAIM + 3 N1 + 2 N. Restoring five unused days returns 2 N then 3 N1. It does not recreate JOINT_LEAVE_CLAIM and creates no arbitrary entitlement.

#### Locked N-2 reversal interpretation

For the N-2 lifecycle, whether the active entitlement has been used is determined by the net effective N-2 commitment after compensating reversals, not merely by the historical existence of a `COMMIT` row.

`netN2CommittedDays = SUM(N2 COMMIT days) - SUM(N2 REVERSAL days)`

- If `netN2CommittedDays = 0`, the active N-2 entitlement is treated as not used for rollover purposes. A full authorized reversal therefore restores the unused status of that N-2 entitlement.
- If `netN2CommittedDays > 0`, the active N-2 entitlement is treated as used. Any remaining N-2 balance may be used only through the end of that calendar year and expires at the next year boundary.
- A partial reversal reduces the net effective N-2 usage only by the reversed amount.
- The original `COMMIT` and compensating `REVERSAL` rows remain in the append-only ledger. This rule changes lifecycle interpretation only; it never deletes or rewrites history.

#### Locked zero-usage interpretation for N-2 qualification

A calendar year counts as a zero-usage year for N-2 qualification when the employee's net effective committed Cuti Tahunan usage for that year is zero after authorized compensating reversals.

`netAnnualLeaveUsageDays = SUM(all Cuti Tahunan COMMIT days) - SUM(all compensating Cuti Tahunan REVERSAL days)`

- If `netAnnualLeaveUsageDays = 0`, the year counts as zero usage and may participate in a qualifying two-year pair.
- If `netAnnualLeaveUsageDays > 0`, the year is not a zero-usage year and breaks the qualifying pair.
- A full authorized reversal can therefore restore a year to zero-usage status.
- A partial reversal still counts as usage whenever the remaining net amount is positive.
- `RELEASE` of a reservation does not count as committed usage because no `COMMIT` occurred.
- Historical `COMMIT` and `REVERSAL` rows remain append-only and auditable; qualification uses their net effective result rather than deleting history.

Authority and evidence decisions remain M4/M5 scope.

### BAL-003 — Working-day calculation

- One shared office calendar applies; no employee roster/shift calendar is introduced.
- Monday–Friday are working days; Saturday/Sunday are non-working.
- `PUBLIC_HOLIDAY`, `JOINT_LEAVE`, and Admin-maintained `INSTITUTION_NON_WORKING` dates are non-working.
- There is no `WORKING_DAY_OVERRIDE` concept. Admin cannot turn weekends/non-working dates into working days.
- Ranges are inclusive and M3 uses full-day units.
- Calculation stays in domain/application logic and calendar data is maintainable per year.

### BAL-004 — Final N / N-1 / N-2 lifecycle

#### N

- N is 12 days each year.
- N is not prorated mid-year under the current baseline.

#### N-1

- N-1 derives only from unused prior-year N.
- N-1 is capped at 6 days.

#### N-2 qualification

- N-2 is capped at 6 days.
- N-2 becomes available only after two consecutive calendar years with zero net effective committed Cuti Tahunan usage.
- Any positive net effective committed Cuti Tahunan usage breaks that qualifying pair.
- A fully reversed year with net effective usage returned to zero may still count as a zero-usage year.
- A qualifying two-year period may issue N-2 only once and must be persisted uniquely per employee/year pair.
- A new N-2 entitlement requires a new independently qualifying pair after the previous active N-2 entitlement has ended.

#### One active N-2 entitlement only

- An employee may have only one active N-2 entitlement at a time.
- N-2 never exceeds 6 days.
- While an active N-2 entitlement still exists, the system must not top it up from another qualifying period.
- No additional N-2 entitlement or qualifying-period reserve is stacked or stored as a hidden future entitlement while an unused active N-2 exists.

#### Carry-forward when N-2 has never been used

- If the active N-2 entitlement has never been used at all, its remaining balance carries into the next calendar year.
- The same unused N-2 may continue to carry across later calendar years until it is first used.
- Carry-forward does not increase the amount above the existing active entitlement and never above 6 days.
- A fully reversed N-2 commitment does not make the entitlement "used" for this rollover rule because its net effective N-2 commitment returns to zero.

Example:

- 2026 N-2 = 6, unused → 2027 N-2 = 6.
- 2027 unused → 2028 N-2 = 6.
- It does not become 12 or 18 days.

#### Partial use and expiry after first use

- If N-2 is used partially during a year, only the amount actually consumed is reduced during that year.
- The remainder stays available until the end of that same calendar year.
- Once the active N-2 entitlement has net effective usage above zero, any remainder does not carry into the next calendar year.
- At the next year boundary, the remaining amount from that used entitlement becomes 0.
- The employee must later satisfy a new qualifying two-year period to receive a new N-2 entitlement.

Example:

- N-2 = 6.
- Employee uses 2 days in 2029.
- Remaining N-2 during the rest of 2029 = 4.
- At rollover into 2030, that remaining 4 expires and N-2 becomes 0.

#### Rollover control

Rollover remains idempotent preview → Admin review → explicit commit. Corrections remain auditable compensations rather than history deletion.

### BAL-005 — Admin-configured Joint Leave policy and future claims

- Admin defines a policy for the applicable year, its individual eligible event dates, annual/event quota under the applicable regulation, claim opening, claim deadline, and balance credit year.
- No global annual number of Joint Leave days is hard-coded.
- Employee `JOINT_LEAVE_CLAIM` balance starts at 0. The configured government/regulatory quota is a ceiling, not an automatic employee credit.
- A future employee claim may contain multiple eligible dates and evidence; multiple claims are allowed.
- Admin may approve all or some requested eligible dates.
- Only approved days credit the employee's `JOINT_LEAVE_CLAIM` balance.
- An employee cannot choose arbitrary credited days, cannot receive credit twice for the same event date, and cumulative approved days cannot exceed the applicable configured quota.
- `eventDate`/applicable year, submission time, and `creditYear` are distinct. Cross-year credit is supported when the configured policy allows it.
- Example: `eventDate=2025-12-24`, submission in January 2026, one approved day, `creditYear=2026`.
- Employee claim, per-date approval uniqueness, evidence, and workflow entities remain deferred to M4/M5.

## 3. Authoritative balance cap and consumption priority

Only Cuti Tahunan reduces the annual-leave balance. Cuti Sakit, Cuti Besar, Cuti Melahirkan, Cuti Alasan Penting, and Cuti Luar Tanggungan / CLTN do not reduce it.

### Regular balance cap

The 24-day cap applies only to the regular annual-leave buckets:

`N + N1 + N2 <= 24`

`JOINT_LEAVE_CLAIM` is outside that regular 24-day cap.

Therefore an approved Claim may increase total usable days above 24.

Example:

- N = 12
- N1 = 6
- N2 = 6
- JOINT_LEAVE_CLAIM = 3
- Regular balance = 24
- Total available balance = 27

The legacy prototype expression `MIN(24, N + N1 + N2 + Claim)` is historical only and is not authoritative.

### Consumption priority

Consumption order remains exactly:

`JOINT_LEAVE_CLAIM → N2 → N1 → N`

Example with Claim 3, N2 6, N1 6, N 12 and a seven-day Cuti Tahunan request:

- consume Claim 3
- consume N2 4
- remaining balances: Claim 0, N2 2, N1 6, N 12

Restoration is not a new priority calculation. It reverses a known original allocation in reverse order (`N → N1 → N2 → JOINT_LEAVE_CLAIM`) only until the authorized count is reached.

## 4. Persistence and migration safety decision

The existing M3 Batch 2 migration is already deployed to official staging and is immutable.

Rule Alignment 2.2 does not rewrite it.

Current persistence already supplies:

- `AnnualBalanceAccount` for bucket/year counters;
- append-only `AnnualBalanceOperation` for GRANT/RESERVE/RELEASE/COMMIT/REVERSAL/ADJUSTMENT history;
- `AnnualRolloverCommit` for idempotent yearly rollover commit;
- `N2QualifyingPeriod` for uniquely consumed qualifying two-year pairs;
- `JointLeavePolicy` and `JointLeaveEvent` for Admin-configured Joint Leave policy/event dates.

For the current Rule Alignment 2.2 domain amendment, N-2 used-vs-unused lifecycle is passed explicitly into rollover calculation. Batch 3 application orchestration must derive that status from authoritative ledger history. The locked derivation is the net N-2 `COMMIT` amount after subtracting compensating N-2 `REVERSAL` amounts. A zero net amount means not used; a positive net amount means used.

The same net-effective interpretation applies to the two calendar years used for N-2 qualification: total Cuti Tahunan `COMMIT` days minus authorized compensating `REVERSAL` days. A zero result counts as zero usage; a positive result breaks the qualifying pair. The system must not infer a new entitlement merely from a lower balance counter.

If later implementation proves that an additional persisted lifecycle marker is necessary, it must be introduced only through a new forward migration.

## 5. Design constraints and next gate

Ledger/history remains append-only at the business boundary. Concurrency must prevent double spend and all sensitive mutations remain auditable.

Before M3 Batch 3 is accepted:

- Rule Alignment 2.2 domain tests must prove unused N-2 carry-forward, no active-entitlement top-up, partial-use year-end expiry, full-reversal restoration of unused N-2 status, full-reversal restoration of annual zero-usage qualification, and the regular 24-day cap with Claim outside that cap.
- Existing BAL-001/BAL-002/BAL-003/BAL-005 behavior must remain regression-safe.
- No existing deployed migration may be edited.

Batch 3 may then implement atomic annual-balance mutation services for reserve, commit, release, reversal, and idempotent rollover against this alignment. Employee Joint Leave claim workflow, evidence, UI/API, and M4 authority remain out of scope for that batch unless separately approved.
