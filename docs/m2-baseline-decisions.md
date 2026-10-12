# M2 Baseline Decisions — Authentication, Employee, and Access

Status: **Approved — M2 gate opened**
Approval date: **25 August 2026**
Authority: **Stakeholder approval in project conversation**
Applies to: **M2 only**

This amendment resolves the M2 blockers `AUTH-002` and `DATA-001` for the baseline implementation. It does not resolve M3+ leave-balance, workflow, approval-authority, document-retention, reporting, notification, or production-readiness decisions.

## AUTH-002 — Organization and access model

Final decision for M2:

- Baseline application roles are exactly `ADMIN_KEPEGAWAIAN` and `PEGAWAI`.
- `PEGAWAI` uses owner isolation: a user may access only their own profile and, when later milestones add them, their own balance, submissions, history, and related private documents unless an explicit later policy grants broader access.
- `ADMIN_KEPEGAWAIAN` has administrative access to employee/account master data and, when later milestones add the relevant surfaces, administrative leave/permission verification data.
- Authorization is enforced server-side through application/resource policy; UI visibility is not an authorization boundary.
- Do not create additional application roles for Kepala Kantor, atasan, auditor, operator unit, Plh/Plt, or other actors in M2. Those require a later explicit policy decision.
- `atasanLangsung` may be represented as an optional employee relationship for future workflow/reminder use, but M2 must not infer approval authority from that relationship.
- Employee/account deactivation must block new login while preserving historical references; hard deletion is not the baseline lifecycle mechanism.

Decision status: **Resolved for M2 baseline**.

## DATA-001 — Employee master and organization data

Final decision for M2:

- Every employee has an internal immutable application ID.
- NIP is a unique employee attribute and is the baseline local-login username/identifier for M2.
- Baseline employee master fields are: internal ID, NIP, name, position/title, work unit, active/inactive status, and optional direct-supervisor relationship.
- Employee master maintenance is available to `ADMIN_KEPEGAWAIAN`.
- Baseline data-entry channels are manual CRUD plus Excel import. No external HR/SSO/master-data synchronization is implemented in M2.
- Import must validate before commit, report row-level errors, reject duplicate/invalid NIP, and must not silently overwrite existing employees.
- Employee/account identity remains separated: business references use Employee/internal IDs; authentication credentials and sessions belong to User/Auth entities.
- Deactivation preserves employee history and prevents authentication when the associated account is inactive.
- Unit/title are baseline master attributes only. M2 must not derive approval scope, readiness, or leave policy from them.

Decision status: **Resolved for M2 baseline**.

## M2 authentication baseline

`AUTH-001` remains authoritative: provider awal is `LOCAL`, password is never stored in plaintext, authentication is separated from Employee and authorization, and all enforcement is server-side.

For M2 implementation:

- Username: NIP.
- Password: securely hashed using the repository-approved password-hashing implementation/parameters; no plaintext or reversible password storage.
- Session: opaque server-side/database session; do not introduce JWT architecture or SSO in M2.
- Disabled employee/account cannot establish a new authenticated session.
- Login, logout, session validation, and authorization failures must not disclose credentials or sensitive configuration.

## Explicit M2 scope

M2 may implement:

- local login/logout/session lifecycle;
- User/AuthIdentity/Credential/Session foundation as required by the approved architecture;
- Employee master CRUD;
- manual employee/account provisioning by Admin;
- Excel import with validation/preview/error reporting;
- role assignment limited to `ADMIN_KEPEGAWAIAN` and `PEGAWAI`;
- resource-policy/owner-isolation tests;
- authenticated Admin and Pegawai shells/pages sufficient to prove RBAC.

M2 must not implement or invent:

- leave-balance calculations (`BAL-001`–`BAL-005`);
- leave/permission workflow or approval authority (`WF-*`, `PERM-*`);
- Kepala Kantor/atasan as new application roles;
- digital approval/e-signature semantics;
- leave document rules beyond existing private-storage foundation;
- dashboard analytics, reports, notifications, or readiness inference;
- TUKIN/disciplinal calculations;
- production user data in staging.

## Gate result

`AUTH-002` and `DATA-001` are no longer blocking M2 under this approved baseline. M3 remains blocked by `BAL-001` through `BAL-005`, and later milestone gates remain unchanged.
