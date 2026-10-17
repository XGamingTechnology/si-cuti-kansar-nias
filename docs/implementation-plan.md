# SI CUTI — Implementation Plan

Status: core M1–M4 implemented progressively; final-decision archives, annual-leave returns and marked PDF editions deployed to staging through PR #106 on 15 October 2026 WIB. Operator rollout evidence and user feedback are recorded in `docs/staging-checkpoint-20261015.md`. This does not close every M5 or production gate.

## 1. Guardrails

PDF, decision log, and approved decision amendments remain authoritative. The Laravel-to-TypeScript/Next.js change occurred before application source existed: no migration/legacy code and no business requirement change.

The application remains a TypeScript-first modular monolith. Next.js is delivery only; critical rules cannot live in React, `page.tsx`, `route.ts`, Server Actions, ORM hooks, or triggers. PostgreSQL is relational persistence; authentication and authorization remain server-side.

M2 must follow `docs/m2-baseline-decisions.md`. Do not use M2 implementation as a reason to invent M3+ leave-balance, workflow, approval-authority, document-retention, reporting, notification, or production policy.

## 2. Milestones

| Milestone | Scope                                      | Gate                                                                      |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| M0        | Product/documentation foundation           | Complete                                                                  |
| **M1**    | Technical foundation only                  | Implemented; staging runtime verified                                     |
| **M2**    | Local auth, Employee, RBAC/resource policy | **COMPLETE — staging-verified**                                           |
| M3        | Leave Balance engine                       | Engine/alignment 2.2 implemented; operational surfaces tracked separately |
| M4        | Leave/permission workflow                  | WF-001–004, PERM-001/002, VAL-001                                         |
| M5        | Verification/document archive              | DOC-001/002/004, AUD-001                                                  |
| M6        | Dashboard/calendar/analytics               | CAL-001, RPT-002, relevant NOT/DATA                                       |
| M7        | Reporting/export                           | RPT-001, AUTH/AUD scope as applicable                                     |
| M8        | Notification, hardening, UAT/production    | NOT-001/002, DEP details, retention/DR                                    |

## 3. Approved technical baseline

The approved and implemented technical direction is Node.js/TypeScript, Next.js/React, PostgreSQL, Prisma, Zod, Vitest, ESLint, Prettier, Pino, Docker Compose, Nginx, and Ubuntu VPS. Authentication baseline is internal `LOCAL` authentication with opaque server-side/database sessions; SSO/JWT architecture is not part of M2.

M2-specific stakeholder approval on 25 August 2026 resolves `AUTH-002` and `DATA-001` through `docs/m2-baseline-decisions.md`:

1. exactly two baseline roles: `ADMIN_KEPEGAWAIAN` and `PEGAWAI`;
2. server-side RBAC/resource policy with owner isolation for Pegawai;
3. internal immutable Employee ID;
4. NIP unique and used as baseline local-login username;
5. employee fields: NIP, name, position/title, work unit, active status, optional direct supervisor;
6. employee master maintained manually by Admin plus validated Excel import;
7. no external HR/SSO synchronization in M2;
8. account/employee deactivation preserves history and blocks new login;
9. no additional application role or approval authority is inferred in M2.

## 4. M2 implementation batches

1. **Schema and migration:** add Employee, User/auth identity/credential/session, role assignment, active-state lifecycle, and optional supervisor relationship without adding leave/workflow entities.
2. **Authentication:** NIP login, secure password hashing, opaque database sessions, secure cookie lifecycle, logout, disabled-account rejection, generic authentication errors.
3. **Authorization:** server-side role/resource policy, default deny, Pegawai owner isolation, Admin employee/account administration, IDOR-focused tests.
4. **Employee master:** Admin CRUD, uniqueness/validation, active/inactive lifecycle, optional supervisor assignment, no hard-delete baseline.
5. **Excel import:** template/contract, parse + validate, preview/error reporting, duplicate NIP protection, transactional commit, no silent overwrite.
6. **Delivery UI:** login page, authenticated Admin shell, authenticated Pegawai shell/profile, employee-management pages sufficient to verify RBAC. Do not build leave balance or workflow UI.
7. **Verification:** typecheck/lint/format/unit/integration/database/auth/authz/HTTP tests; migration review; Docker build; deploy exact candidate image to staging; guard/migration/readiness/smoke/UAT; record immutable digest before any later production promotion.

## 5. Explicit exclusions for M2

No leave balance calculation, leave submission/approval, permission workflow, dashboard analytics, calendar, reports, notification semantics, Klaim Cuti Bersama processing, TUKIN automation, digital approval/e-signature, or unresolved policy. No microservices, Kubernetes, Redis/Kafka/RabbitMQ, second ORM, SSO, JWT architecture, or unnecessary browser E2E suite.

The `atasanLangsung` relationship may exist as optional master data, but it does not grant approval authority in M2. `ADMIN_KEPEGAWAIAN` administration likewise must not be interpreted as final legal leave approval.

## 6. Exit and later gates

M2 is complete: authentication, session handling, employee lifecycle, two-role RBAC, owner isolation, Admin employee/account administration, Excel import validation, migration, and staging runtime verification passed without secrets or real employee data in staging. The immutable artifacts and verification outcomes are recorded in `docs/m2-verification-record.md`.

M3 balance mutation/rollover and Rule Alignment 2.2 are implemented. Single and batch opening-balance
administration are implemented. Employee Joint Leave claims are implemented and merged through PR #109; business UAT remains pending.
M4 LeaveRequest/PermissionRequest follows approved WF-001–004, PERM-001/002 and VAL-001; these
flows are no longer globally blocked by the original decision register. M5 includes private signed
scans, immutable submission proofs, final-decision archives and marked PDF editions. Official
numbering, document retention and comprehensive audit/production acceptance remain separate gates.
Before production, M8 must decide off-VPS destination,
retention/rotation/encryption, restore cadence, RPO/RTO, and DR runbook; same-VPS backup is not
complete DR.

Release continues to promote the exact immutable version that passed staging/UAT. Production migration requires separate explicit approval; changing a Git branch alone does not authorize a production migration.

## Issue #104: final decision PDFs and annual-leave returns, delivered

Implementation baseline: `docs/leave-records-decisions.md`. A signed scan is pinned with an immutable
approval/rejection snapshot; a separate status sheet plus original scan pages forms the generated
private result PDF. Rejection without a scan produces a decision notice. Approved annual leave may
receive an Admin-recorded, evidence-backed compensating reversal with preview, audit links and
stable replay keys. LeaveRequest remains APPROVED.

PR #105 merged as `193be89ab91fe2fb4b082d8fe0f08152c5e85dcf` and was deployed with migration
`20261014120000_leave_decision_archives_and_returns`. PR #106 merged as
`f6be359adddac8e518dea95e20841e42a8cccd0e` and adds previewed markers on source forms, readable
decision appendices, immutable edition history and request-scoped feedback. Its migration
`20261015100000_leave_decision_editions` was applied during the verified staging rollout.

The original signed scan remains unchanged. Admin must preview, verify and save a marked edition;
merge or deployment does not automatically stamp every existing archive. See `docs/decision-form-stamps.md`.
The user reported the result was okay after rollout; this is scoped feedback, not exhaustive UAT.
Public HTTPS health output for this rollout was requested but has not yet been supplied.

## Current delivery checkpoint — 17 October 2026 WIB

Verified on GitHub and `origin/staging` at `4fdda0ec2bc2ce92bc9c5cbc93fa4bc8ca488a4b`:

| Scope                             | Implemented / merged evidence                                                      | Deployment                                                                                         | Business UAT |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| Klaim Cuti Bersama                | PR #109, merge `f38ebe5224decae9754ea050c090a6bfd2b3ca14`                          | User reports staging `cdc180952982caa5f2aedc28685d5fd5578ccd74`, internal/public health successful | Pending      |
| Emergency Pejabat Cuti correction | PR #110, merge `ca27193335849f0c53c06a0acda40089256138a9`                          | Latest operator rollout output not supplied in this task                                           | Pending      |
| M6 dashboard/calendar             | PR #112, merge `82fb264c5b9c7584272880a1308743d3a7d3b8fe`; design #111 also merged | Latest operator rollout output not supplied in this task                                           | Pending      |
| Employee UI refinement            | Current feature branch; see `employee-ui-refinement.md`                            | Not deployed by this task                                                                          | Pending      |

Merged, implemented, deployed, health-checked and UAT accepted are separate states. This checkpoint
records repository evidence and explicitly attributed user reports; it does not certify a new rollout
or mark all milestones complete. No staging/production database was accessed.

## Next work

1. Business UAT for claims, official corrections, dashboard/calendar and the employee UI.
2. **M7 PDF/Excel reporting**: determine approved fields, period/status semantics, export authorization
   and audit. Not implemented in the employee UI PR.
3. Remaining supervisor/legacy/provenance operational corrections, scoped individually.
4. Reminders and production hardening: original NOT/DEP/retention/DR decisions still apply.

The historical issue audit is `docs/backlog-20261015.md`, updated with the current checkpoint below
its original audit. Source/tests and same-VPS backup alone do not prove production readiness.
