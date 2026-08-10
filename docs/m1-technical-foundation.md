# M1 Technical Foundation

Status: **implemented** (10 August 2026)

## Scope and structure

M1 supplies only application and operational foundations. It contains no authentication, employee,
leave, permission, workflow, notification, dashboard, or other SI CUTI business feature. Identity
models were unnecessary for M1 connectivity and are deliberately deferred. Unresolved gates in the
decision log remain authoritative.

The npm repository uses Node.js 24, TypeScript/ESM, Next.js App Router with standalone output,
Prisma 7 with its PostgreSQL driver adapter, Zod, Pino, and Vitest. Delivery code is in `src/app`;
application ports and infrastructure adapters remain separate. The Prisma schema intentionally has
no application model. Its initial migration establishes migration history without prematurely
encoding AUTH, BAL, WF, PERM, NOT, or other policy.

## Containers and security

The topology has persistent production and staging Compose projects behind one shared edge. Only
edge Nginx publishes 80/443. Each PostgreSQL has its own internal network with no host port, and a
database marker guard runs before migration/app. The disposable, non-root standalone app has a read-only
root filesystem, dropped capabilities, and a persistent private-document volume. Nginx neither
mounts nor aliases private storage. PostgreSQL and documents use separate named volumes. Bootstrap
creates the app role as `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`.

Environment credentials/secrets, database and document volumes, backup roots, and mutable data are
independent. Staging is dummy-data UAT, not automated test. The release procedure and deferred VPS
verification checklist are in `docs/deployment-environments.md`.

`DocumentStorage` is an application port. `LocalPrivateStorage` requires an absolute private root,
uses opaque keys, rejects traversal, writes atomically with restrictive permissions, and calculates
SHA-256. It provides no HTTP download or anonymous public URL. Document workflows, authorization,
metadata, and file policy remain later work.

Liveness is `/api/health/live`; readiness is `/api/health/ready`. Responses expose no configuration.
Pino emits structured JSON and redacts common password, session, token, cookie, authorization, and
document-content fields. Infrastructure logging is not the gated business audit log.

## Operations

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run build
npm run db:validate
docker compose config
docker compose up --build -d
```

Copy `.env.example` to ignored `.env` and replace every example credential. PostgreSQL integration
tests run when `DATABASE_URL` exists and otherwise skip. `scripts/backup-postgres.sh` creates a
custom-format logical dump. `scripts/backup-documents.sh` creates an archive and checksum. Both use
UTC artifact names, restrictive umask, partial cleanup, and a backup root separate from primary
data. Retention, overlap locking, encryption, external target, restore automation, RPO, RTO, and DR
policy remain open. A same-VPS artifact is **not disaster recovery**.

## Remaining gates and debt

- M2 remains blocked by AUTH-002 and DATA-001; no authentication exists in M1.
- Later milestones remain blocked by the decision IDs recorded in `docs/decision-log.md`.
- TLS certificate ownership, off-VPS backup, restore drills, monitoring/SLOs, and image digest
  recording remain production-readiness work.
