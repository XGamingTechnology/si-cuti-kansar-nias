# SI CUTI — Implementation Plan

Status: **M1 proposal complete; executable work blocked pending stack approval**

## 1. Guardrails

PDF and decision log remain authoritative. The Laravel-to-TypeScript/Next.js change occurred before application source existed: no migration/legacy code and no business requirement change. Do not scaffold, install dependencies, or create application source until TECH-002/TECH-003 approval.

M1 is a modular monolith. Next.js is delivery only; critical rules cannot live in React, `page.tsx`, `route.ts`, Server Actions, ORM hooks, or triggers. PostgreSQL is relational persistence; authorization remains server-side.

## 2. Milestones

| Milestone | Scope | Gate |
|---|---|---|
| M0 | Product/documentation foundation | Complete |
| **M1** | Technical foundation only | Final technical-baseline approval |
| M2 | Local auth, Employee, RBAC/resource policy | AUTH detail, AUTH-002/DATA-001 as relevant |
| M3 | Leave Balance engine | BAL-001–BAL-005 |
| M4 | Leave/permission workflow | WF-001–004, PERM-001/002, VAL-001 |
| M5 | Verification/document archive | DOC-001/002/004, AUD-001 |
| M6 | Dashboard/calendar/analytics | CAL-001, RPT-002, relevant NOT/DATA |
| M7 | Reporting/export | RPT-001, AUTH-002, AUD-001 |
| M8 | Notification, hardening, UAT/production | NOT-001/002, DEP details, retention/DR |

## 3. Approval package

`docs/technical-baseline.md` provides all 22 requested deliverables. Stakeholder decision requested:

1. Node 24, Next 16/React 19, TypeScript 5, PostgreSQL 18;
2. Prisma 7 (Drizzle remains alternative);
3. Zod 4, Vitest 4, ESLint 9, Prettier 3, Pino 10;
4. internal LOCAL auth + opaque database sessions; defer Auth.js/JWT;
5. technical owner may re-verify and exact-pin stable patches/digests inside approved majors; any major change returns for approval.

## 4. M1 batches — do not execute before approval

1. **Evidence/scaffold:** verify official matrices, record exact patches/digests, scaffold into temporary directory, review minimal diff.
2. **Quality/boundaries:** strict TS, lint/format/test/CI commands, layer structure, env schema, safe logging/errors, health endpoint.
3. **Database:** PostgreSQL persistent/private, least-privilege roles, committed Prisma migration, real-PostgreSQL test harness.
4. **Auth/authz:** provider-neutral identity/session ports, secure cookies/Argon2id after policy, rate-limit/CSRF, ResourcePolicy/default deny; no SSO.
5. **Documents:** `DocumentStorage`, private local adapter, traversal/stream limits/checksum, authorized download and mandatory IDOR tests.
6. **Operations:** multi-stage non-root Dockerfile; base+production Compose; Nginx-only ingress; cron job contract; DB+document backup/external-copy interface; no queue.
7. **Verification:** frozen install, format/lint/typecheck, unit/integration/database/auth/authz/document/HTTP tests, migration/build/Compose/container/health checks, persistence and backup/restore dry run.

## 5. Explicit exclusions

No leave balance/application/approval, dashboard, calendar, reports, notification semantics, Klaim Cuti Bersama, TUKIN automation, or unresolved policy. No microservices, Kubernetes, Redis/Kafka/RabbitMQ, second ORM, SSO, JWT architecture, or large browser E2E suite.

## 6. Exit and later gates

M1 exit requires the full acceptance criteria in `docs/technical-baseline.md`, command-result reporting, and no secrets/real employee data. M3 waits for BAL-*; M4/M5 wait workflow/document authority; cron availability does not authorize NOT-* semantics. Before production, M8 must decide off-VPS destination, retention/rotation/encryption, restore cadence, RPO/RTO, and DR runbook; same-VPS copy is not complete DR.
