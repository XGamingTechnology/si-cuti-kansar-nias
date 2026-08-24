# SI CUTI — Implementation Plan

Status: **M1 technical foundation implemented and staging-verified; M2 baseline approved and executable**

## 1. Guardrails

PDF, decision log, and approved decision amendments remain authoritative. The Laravel-to-TypeScript/Next.js change occurred before application source existed: no migration/legacy code and no business requirement change.

The application remains a TypeScript-first modular monolith. Next.js is delivery only; critical rules cannot live in React, `page.tsx`, `route.ts`, Server Actions, ORM hooks, or triggers. PostgreSQL is relational persistence; authentication and authorization remain server-side.

M2 must follow `docs/m2-baseline-decisions.md`. Do not use M2 implementation as a reason to invent M3+ leave-balance, workflow, approval-authority, document-retention, reporting, notification, or production policy.

## 2. Milestones

| Milestone | Scope                                      | Gate                                       |
| --------- | ------------------------------------------ | ------------------------------------------ |
| M0        | Product/documentation foundation           | Complete                                   |
| **M1**    | Technical foundation only                  | Implemented; staging runtime verified      |
| **M2**    | Local auth, Employee, RBAC/resource policy | **Approved — executable**                  |
| M3        | Leave Balance engine                       | BAL-001–BAL-005                            |
| M4        | Leave/permission workflow                  | WF-001–004, PERM-001/002, VAL-001          |
| M5        | Verification/document archive              | DOC-001/002/004, AUD-001                   |
| M6        | Dashboard/calendar/analytics               | CAL-001, RPT-002, relevant NOT/DATA        |
| M7        | Reporting/export                           | RPT-001, AUTH/AUD scope as applicable      |
| M8        | Notification, hardening, UAT/production    | NOT-001/002, DEP details, retention/DR     |

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

M2 exits only when authentication, session handling, employee lifecycle, two-role RBAC, owner isolation, Admin employee/account administration, Excel import validation, migration, and staging runtime verification pass without secrets or real employee data in staging.

M3 remains blocked by `BAL-001` through `BAL-005`; no day-count, rollover, balance reservation/commit, cancellation restore, or Klaim Cuti Bersama formula may be invented in M2. M4/M5 remain blocked by workflow/document authority decisions. Before production, M8 must decide off-VPS destination, retention/rotation/encryption, restore cadence, RPO/RTO, and DR runbook; same-VPS backup is not complete DR.

Release continues to promote the exact immutable version that passed staging/UAT. Production migration requires separate explicit approval; changing a Git branch alone does not authorize a production migration.
