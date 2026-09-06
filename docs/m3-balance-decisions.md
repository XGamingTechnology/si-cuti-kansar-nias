# SI CUTI — M3 Leave Balance Decision Amendment

Status: **AUTHORITATIVE AMENDMENT — APPROVED FOR CURRENT M3 BASELINE**
Scope: **BAL-001 through BAL-005**

## 1. Authority and scope

This document is the authoritative amendment for `BAL-001` through `BAL-005` for the current M3
baseline. It supersedes the implementation status of those decisions in `docs/decision-log.md` while
preserving the original ambiguity and recommendation text there as historical context. It authorizes
M3 implementation only within the decisions below; it does not mark M3 complete and does not resolve
M4 or M5 workflow, approval-authority, or document-authority decisions.

## 2. Approved decisions

### BAL-001 — Balance reservation and commit

Status: **RESOLVED**

- For annual leave, reserve the required number of days atomically when the leave request is
  submitted.
- Reserved days are not available to another request.
- Commit the reservation as final annual-leave consumption when Admin Kepegawaian declares the final
  administrative file complete.
- Do not define reject/cancel restoration here; BAL-002 governs that.

### BAL-002 — Reject/cancel/reversal

Status: **RESOLVED**

- If a request is still reserved and is rejected/cancelled, release the full reservation.
- If already committed but leave has not started, create a full compensating reversal.
- If leave has partially occurred, reverse only the portion not used.
- Never edit or delete historical balance ledger entries.
- Corrections must be new compensating transactions.
- Who may reject/cancel and workflow transition permissions remain M4/WF-004 scope.

### BAL-003 — Working-day calculation

Status: **RESOLVED**

- Use one shared office working calendar, not per-employee roster/shift calendars.
- Baseline working days are Monday through Friday.
- Saturday and Sunday do not consume leave.
- Official Indonesian public holidays do not consume leave.
- Official government joint-leave dates recorded in the working calendar do not consume annual
  leave.
- Allow authoritative institution-specific calendar overrides through calendar master data.
- Date ranges are inclusive.
- M3 baseline supports full-day units only; no 0.5-day leave.
- Day calculation must be centralized domain/application logic and must not be hard-coded in
  React/routes/database triggers.
- Calendar data must be maintainable per year rather than requiring source-code changes.

### BAL-004 — N / N-1 / N-2 rollover

Status: **PROVISIONAL APPROVED FOR CURRENT M3 BASELINE**

This policy is revisable if an authoritative Basarnas/BKN/other applicable rule later requires a
different formula.

Current baseline:

- N annual entitlement = 12 days.
- N-1 is carry-over of unused N from the previous year, capped at 6 days.
- N-2 is capped at 6 days and only applies when the provisional two-year condition is satisfied.
- A calendar year counts as "tidak mengambil Cuti Tahunan" when committed annual-leave consumption
  for that year is exactly 0 days.
- The N-2 condition is satisfied only when two consecutive calendar years each have committed
  annual-leave consumption of 0 days.
- If either year has at least 1 committed annual-leave day, the two-year condition is not satisfied.
- N-1 and N-2 must not automatically cascade indefinitely without the defined policy condition.
- For the current provisional baseline, a new employee entering mid-year receives N = 12 days; no
  prorating.
- Annual rollover is an idempotent batch: preview -> Admin review -> explicit commit.
- The same employee/year rollover must not be applied twice.
- Corrections to an already committed rollover must use auditable adjustment/reversal entries rather
  than deleting history.

### BAL-005 — Joint Leave Claim

Status: **RESOLVED**

- Admin maintains an official Joint Leave event/catalog.
- Each event has authoritative date/period, claim value in full days, active/eligibility state, and
  source/basis reference.
- Employee selects an eligible event and uploads supporting evidence.
- Maximum one claim per employee per event.
- Initial claim state is pending.
- Admin approval adds the event's configured Joint Leave quota.
- Rejection adds no quota.
- Employee must not freely enter the number of claim days.
- Corrections use adjustment/reversal; do not overwrite ledger history.
- Detailed document-authority/workflow rules remain M4/M5 scope.

## 3. Preserved annual-balance rules

Annual balance consumption priority remains:

1. Joint Leave Claim
2. N-2
3. N-1
4. N

The following leave types do not reduce annual-leave balance under the existing source requirement:

- Sick Leave
- Leave for Important Reasons
- Long Leave
- Maternity Leave
- Leave Outside State Responsibility / CLTN

## 4. Design constraints

- Ledger/history must be append-only from the business perspective.
- Reservation, commit, release, reversal, adjustment, and rollover must be auditable.
- Critical balance logic belongs in domain/application services.
- Concurrency must prevent double-spend.
- There must be no hidden automatic policy changes.
- M3 must not invent M4 approval authority or document authority.
