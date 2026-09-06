# SI CUTI — M3 Leave Balance Decision Amendment

Status: **AUTHORITATIVE RULE ALIGNMENT 2.1 — REQUIRED BEFORE M3 BATCH 3**
Scope: **BAL-001 through BAL-005**

## 1. Authority, supersession, and scope

This document is the authoritative amendment for the current M3 baseline. Rule Alignment 2.1
supersedes (a) `WORKING_DAY_OVERRIDE`, (b) the former BAL-005 one-claim-per-event and event-owned
fixed-value assumption, and (c) the earlier incomplete N-2 regeneration semantics. The old wording
remains visible in Git and `docs/decision-log.md` as historical decision-log context; it is not a
supported business rule.

This alignment supplies domain and not-yet-deployed persistence foundations only. It does not
implement LeaveRequest, claim/deferral approval workflow, evidence storage, API, UI, notification,
reporting, approval hierarchy, or an M4 state machine. M3 remains in progress.

## 2. Approved decisions

### BAL-001 — Balance reservation and commit

For Cuti Tahunan, reserve required days atomically on submission and commit them when Admin
Kepegawaian declares the final administrative file complete. Reserved days cannot be double-spent.
Workflow authority remains M4 scope.

### BAL-002 — Release, reversal, and authorized deferral

A rejected/cancelled reservation is released. An unused part of an already committed Cuti Tahunan
period may be returned when interrupted/deferred by official assignment or another authorized basis.
The return must reference the original committed allocation, may cover only authorized unused days,
and reconstructs that allocation in reverse order. It creates append-only compensating `REVERSAL`
operations referencing original `COMMIT` operations; original rows are never edited or deleted.
Authority and evidence decisions remain M4/M5 scope.

Example: a seven-day COMMIT allocated 2 JOINT_LEAVE_CLAIM + 3 N1 + 2 N. Restoring five unused days
returns 2 N then 3 N1. It does not recreate JOINT_LEAVE_CLAIM and creates no arbitrary entitlement.

### BAL-003 — Working-day calculation

- One shared office calendar applies; no employee roster/shift calendar is introduced.
- Monday–Friday are working days; Saturday/Sunday are non-working.
- `PUBLIC_HOLIDAY`, `JOINT_LEAVE`, and Admin-maintained `INSTITUTION_NON_WORKING` dates are
  non-working.
- There is **no `WORKING_DAY_OVERRIDE` concept**. Admin cannot turn weekends/non-working dates into
  working days.
- Ranges are inclusive and M3 uses full-day units. Calculation stays in domain/application logic and
  calendar data is maintainable per year.

### BAL-004 — Final N / N-1 / N-2 baseline

- N is 12 days. N-1 derives only from unused prior-year N and is capped at 6 days.
- N-2 is capped at 6 days and becomes available after two consecutive calendar years with zero
  committed Cuti Tahunan usage. Any committed usage breaks that pair.
- N-2 never grows beyond 6. There is no indefinite carry/cascade.
- A qualifying two-year period is consumed when it issues N-2 and must be persisted uniquely per
  employee/year pair. Spending the issued balance cannot cause the same pair to issue it again.
- A new entitlement needs a new independently recorded pair of two consecutive zero-usage years.
- Rollover remains idempotent preview → Admin review → explicit commit; corrections are auditable
  compensations, never history deletion. N remains 12 without mid-year proration under this baseline.

### BAL-005 — Admin-configured Joint Leave policy and future claims

- Admin defines a policy for the applicable year, its individual eligible event dates, annual/event
  quota under the applicable regulation, claim opening, claim deadline, and balance credit year.
  No global cap, deadline, or annual number of Joint Leave days is hard-coded.
- Employee JOINT_LEAVE_CLAIM balance starts at 0. A future employee claim may contain multiple
  eligible dates and evidence; multiple claims are allowed.
- Admin may approve all or some requested eligible dates. Only approved days credit the balance.
  An employee cannot choose arbitrary credited days, cannot receive credit twice for the same event
  date, and cumulative approved days cannot exceed the applicable configured quota.
- `eventDate`/applicable year, submission time, and `creditYear` are distinct. For example,
  `eventDate=2025-12-24`, submission in January 2026, one approved day, and `creditYear=2026`.
- This task persists policy/event-date masters only. Employee claim, per-date approval uniqueness,
  evidence, and workflow entities are deliberately deferred to M4/M5.

## 3. Authoritative leave types and balance priority

Only **Cuti Tahunan** reduces annual-leave balance. Cuti Sakit, Cuti Besar, Cuti Melahirkan, Cuti
Alasan Penting, and Cuti Luar Tanggungan / CLTN do not reduce it; their workflows are not implemented
in M3.

Consumption order remains exactly `JOINT_LEAVE_CLAIM → N2 → N1 → N`. Restoration is not a new
priority calculation: it reverses a known original allocation in reverse (`N → N1 → N2 →
JOINT_LEAVE_CLAIM`) only until the authorized count is reached.

## 4. Persistence and migration safety decision

Batch 2's migration has not been applied to staging and there is no M3 staging data. Therefore Rule
Alignment 2.1 edits the existing not-yet-deployed migration in place so a first deployment never
creates the removed enum value or obsolete fixed-claim schema. This is safer than a PostgreSQL enum
value-removal migration and avoids temporarily installing an invalid business value.

The migration adds `N2QualifyingPeriod` (unique employee + qualifying year pair, issuance/credit
metadata), `JointLeavePolicy` (applicable year, configurable quota/window, credit year), and
`JointLeaveEvent` child dates. Constraints enforce consecutive N-2 years, a maximum six-day issuance,
valid claim windows, and unique event dates within a policy. A fresh disposable PostgreSQL database
must pass migration-from-zero verification. **No migration may be applied to staging in this task.**

## 5. Design constraints and next gate

Ledger/history is append-only at the business boundary; concurrency must prevent double spend and
all sensitive mutations remain auditable. Batch 3 may implement atomic annual-balance mutation
services (reserve/commit/release/reversal and idempotent rollover) against this alignment, but not
claim/deferral workflows, evidence, UI/API, or M4 authority.
