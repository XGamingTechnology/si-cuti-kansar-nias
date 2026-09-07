# SI CUTI - M4 Batch 1 Workflow Schema Design

Status: PROPOSED FOR STAKEHOLDER REVIEW - NO MIGRATION YET
Baseline commit: `653e417822010f2f9d5cc509454284b2e7c13b72`
Authority: `docs/m4-workflow-decisions.md`, `docs/m3-balance-decisions.md`

## 1. Batch 1 objective

Add the minimum relational persistence needed for the approved M4 leave and non-leave permission workflow without implementing M5 document archive/retention, official registration numbering, reporting, notifications, or UI/API behavior.

The schema must preserve immutable submitted revisions, owner isolation, server-side transition authorization, final-state immutability, and the M3 annual-balance transaction boundary.

## 2. Proposed enums

### WorkflowRequestStatus

- `DRAFT`
- `SUBMITTED`
- `RETURNED_FOR_CORRECTION`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

`RESUBMITTED` is intentionally not a state. A resubmission is represented by a new immutable revision and a transition back to `SUBMITTED`.

### LeaveType

The baseline may represent only leave categories explicitly named in the product requirements:

- `ANNUAL`
- `SICK`
- `IMPORTANT_REASON`
- `LARGE`
- `MATERNITY`
- `CLTN`

These enum values identify categories only. They do not imply unapproved eligibility, duration, evidence, gender, service-period, or other policy rules.

## 3. LeaveRequest

Parent workflow record.

Proposed fields:

- `id` UUID primary key
- `employeeId` UUID FK to Employee
- `status` WorkflowRequestStatus, default `DRAFT`
- `currentRevisionNumber` integer, default 1
- `createdAt` timestamptz
- `updatedAt` timestamptz

Relations:

- owning Employee
- revisions
- transitions

Indexes:

- employee + status
- employee + createdAt

No official registration number is introduced in Batch 1 because DOC-004 is not approved.

## 4. LeaveRequestRevision

Versioned request content. The current draft revision may be edited while it has never been submitted. Once submitted, that revision becomes immutable at the application boundary. A return for correction creates the next revision number; the previously submitted revision is never overwritten.

Proposed fields:

- `id` UUID primary key
- `leaveRequestId` UUID FK
- `revisionNumber` integer
- `leaveType` LeaveType
- `startDate` date
- `endDate` date
- `reason` text
- `calculatedWorkingDays` integer nullable until submission calculation is finalized
- `submittedAt` timestamptz nullable
- `createdAt` timestamptz
- `updatedAt` timestamptz

Constraints/indexes:

- unique request + revisionNumber
- revisionNumber >= 1
- endDate >= startDate
- calculatedWorkingDays, when present, > 0

For Cuti Tahunan, the revision UUID is the stable M4 reference used by M3 balance operations. The workflow service will call M3 with a deterministic reference type such as `LEAVE_REQUEST_REVISION` and the revision UUID. Batch 1 does not change the M3 ledger schema.

Cross-calendar-year annual-leave allocation is not hard-coded by this schema; start/end dates remain representable without inventing an unresolved allocation policy.

## 5. LeaveRequestTransition

Append-only workflow transition record for state history and decision provenance.

Proposed fields:

- `id` UUID primary key
- `leaveRequestId` UUID FK
- `revisionId` UUID FK to the exact LeaveRequestRevision acted upon
- `fromStatus` WorkflowRequestStatus
- `toStatus` WorkflowRequestStatus
- `actorUserId` UUID FK to User
- `reason` text nullable; required by application policy for RETURNED_FOR_CORRECTION and REJECTED
- `evidenceReference` varchar(191) nullable
- `occurredAt` timestamptz
- `idempotencyKey` varchar(191) unique
- `createdAt` timestamptz

`evidenceReference` is an opaque M4 bridge only. It allows WF-002 to require an evidence reference for APPROVED without prematurely designing M5 storage/archive entities. M5 may later introduce a formal document relation through a forward migration. Batch 1 does not store document bytes or public URLs.

APPROVED transitions must contain the acting Admin, timestamp, exact revision, and non-empty evidence reference at the application boundary.

## 6. PermissionRequest

Separate parent workflow record as required by PERM-001.

Proposed fields:

- `id` UUID primary key
- `employeeId` UUID FK to Employee
- `status` WorkflowRequestStatus, default `DRAFT`
- `currentRevisionNumber` integer, default 1
- `createdAt` timestamptz
- `updatedAt` timestamptz

Relations and indexes parallel LeaveRequest.

PermissionRequest has no relation to AnnualBalanceAccount or AnnualBalanceOperation.

## 7. PermissionRequestRevision

Proposed fields:

- `id` UUID primary key
- `permissionRequestId` UUID FK
- `revisionNumber` integer
- `startDate` date
- `endDate` date
- `reason` text
- `submittedAt` timestamptz nullable
- `createdAt` timestamptz
- `updatedAt` timestamptz

Constraints/indexes:

- unique request + revisionNumber
- revisionNumber >= 1
- endDate >= startDate

No permission-type enum, duration limit, TUKIN field, or disciplinary classification is invented in Batch 1 because PERM-001/PERM-002/VAL-001 explicitly defer those unapproved rules.

## 8. PermissionRequestTransition

Append-only transition table parallel to LeaveRequestTransition.

Proposed fields:

- `id` UUID primary key
- `permissionRequestId` UUID FK
- `revisionId` UUID FK
- `fromStatus` WorkflowRequestStatus
- `toStatus` WorkflowRequestStatus
- `actorUserId` UUID FK to User
- `reason` text nullable
- `evidenceReference` varchar(191) nullable
- `occurredAt` timestamptz
- `idempotencyKey` varchar(191) unique
- `createdAt` timestamptz

The same WF-002 evidence rule applies to APPROVED permission transitions. No annual-balance mutation is permitted for PermissionRequest.

## 9. Employee and User relations

Employee receives relations to owned LeaveRequest and PermissionRequest records.

User receives relations to transition records where the User acted as the authenticated workflow actor.

Existing Employee/User lifecycle remains unchanged. No new application role is added.

## 10. Persistence invariants for the forward migration

The Batch 1 migration should add database constraints for structural invariants that PostgreSQL can enforce safely, including:

- revision number >= 1;
- end date >= start date;
- calculated working days > 0 when present;
- unique revision number per parent request;
- unique transition idempotency key;
- restrictive foreign keys preserving history.

State-transition authorization, owner isolation, reason-required semantics, evidence-required approval, immutable-submitted-revision behavior, and balance side effects remain domain/application-service rules and must not be implemented in React, route handlers, Prisma hooks, or database triggers.

## 11. Explicit Batch 1 exclusions

Batch 1 does not add:

- document bytes, archive retention, checksum/version/supersede behavior from M5;
- official registration number/pattern from DOC-004;
- general audit trail from AUD-001;
- JointLeaveClaim workflow/evidence/partial-approval persistence;
- TUKIN/disciplinal calculations;
- unapproved leave-type eligibility or duration rules;
- notifications, reporting, dashboard, calendar UI, API, or pages;
- production migration;
- edits to any previously deployed migration.

JointLeaveClaim remains a separate later M4/M5 batch because BAL-005 requires event/date linkage, evidence, partial approval, quota bounding, and duplicate employee/date protection that should not be hidden inside LeaveRequest.

## 12. Proposed Batch 1 verification gate

Before this schema is accepted:

1. Prisma schema validation passes with Prisma 7.4.2.
2. A new forward migration is reviewed; no deployed migration is edited.
3. Migration from zero passes against disposable PostgreSQL 18.1.
4. Existing M1-M3 tests remain green.
5. New persistence integration tests prove revision uniqueness, restrictive foreign keys, check constraints, and transition idempotency uniqueness.
6. No staging database is touched until the branch is reviewed and merged through the normal staging flow.
