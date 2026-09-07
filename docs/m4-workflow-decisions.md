# SI CUTI - M4 Workflow Decisions

Status: PROVISIONAL APPROVED FOR CURRENT M4 BASELINE

## Change policy

These workflow decisions are provisional for the current M4 implementation. They may be updated later through an explicit documented amendment. Existing audit history must be preserved when a later rule changes.

## WF-001 - Hybrid workflow boundary

Status: PROVISIONAL APPROVED

1. Pegawai creates and tracks the leave or permission request in SI CUTI.
2. SI CUTI may generate the administrative form for printing.
3. Signatures or acknowledgements required outside the application remain part of the existing physical process.
4. The signed or stamped final document is uploaded as supporting evidence and retained in the application archive.
5. M4 does not implement electronic signature.

## WF-002 - Admin approval with supporting evidence

Status: PROVISIONAL APPROVED

1. ADMIN_KEPEGAWAIAN is the application role that records the final APPROVED or REJECTED decision in SI CUTI.
2. APPROVED may only be recorded after the required supporting evidence for that request has been received and verified.
3. For the current hybrid process, the signed or stamped document remains the formal supporting evidence. The Admin action records the decision in SI CUTI based on that evidence; it does not replace the evidence.
4. The approval record must capture at minimum the acting Admin, decision timestamp, request reference, and evidence reference when approval requires evidence.
5. A request must not move to the final approved state when required evidence is missing.
6. A later move to a fully digital approval process may supersede this rule through a new stakeholder-approved amendment.

## WF-003 - Correction, revision, and resubmission

Status: PROVISIONAL APPROVED

1. Admin may return a submitted request for correction before a final APPROVED or REJECTED decision and must record a return reason.
2. A returned request keeps the same parent Request ID, while every resubmission creates a new immutable revision/version.
3. Only the Pegawai who owns the request may edit the request content after it has been returned. Admin does not directly rewrite employee-submitted request data.
4. Prior revisions remain preserved and auditable; a resubmission never overwrites earlier submitted content.
5. For Cuti Tahunan, returning a submitted request releases the balance reservation associated with the submitted revision. A later resubmission recalculates working days from the latest revision and creates a new atomic reservation using the current available balance.
6. If the available annual-leave balance is insufficient at resubmission time, the resubmission must fail validation and no new reservation is committed.
7. A final APPROVED request is immutable as a submitted request. Any later authorized correction that affects committed annual-leave balance must use the applicable auditable correction or compensating reversal process rather than rewriting the approved revision or ledger history.
8. A final REJECTED request cannot be reopened or resubmitted. A Pegawai who wishes to apply again creates a new request with a new Request ID.
9. The exact status names and transition permissions implementing this behavior are defined under WF-004.

## WF-004 - State machine and transition permissions

Status: PROVISIONAL APPROVED

### Request states

The current M4 baseline uses these request states:

- DRAFT
- SUBMITTED
- RETURNED_FOR_CORRECTION
- APPROVED
- REJECTED
- CANCELLED

RESUBMITTED is not a separate state. A resubmitted revision returns to SUBMITTED, while the immutable revision number records that it is a later submission.

### Pegawai transitions

1. Pegawai may create and edit only their own DRAFT request.
2. DRAFT to SUBMITTED is performed by the owning Pegawai.
3. RETURNED_FOR_CORRECTION may be edited only by the owning Pegawai.
4. RETURNED_FOR_CORRECTION to SUBMITTED creates a new immutable revision and is performed by the owning Pegawai.
5. The owning Pegawai may cancel a non-final request while it is DRAFT, SUBMITTED, or RETURNED_FOR_CORRECTION.
6. Pegawai cannot directly transition a request to APPROVED or REJECTED.

### Admin Kepegawaian transitions

1. SUBMITTED to RETURNED_FOR_CORRECTION is performed by ADMIN_KEPEGAWAIAN and requires a recorded reason.
2. SUBMITTED to REJECTED is performed by ADMIN_KEPEGAWAIAN and requires a recorded reason.
3. SUBMITTED to APPROVED is performed by ADMIN_KEPEGAWAIAN only after the required supporting evidence has been received and verified under WF-002.
4. Admin does not directly edit the Pegawai submitted request content.

### Terminal states

APPROVED, REJECTED, and CANCELLED are terminal for the original request workflow and cannot be reopened.

A later authorized correction after APPROVED must use a separate auditable correction or compensating process. A later attempt after REJECTED requires a new Request ID.

### Annual leave balance effects

For Cuti Tahunan only:

1. DRAFT has no balance effect.
2. DRAFT to SUBMITTED creates an atomic RESERVE for the calculated working days.
3. SUBMITTED to RETURNED_FOR_CORRECTION releases the reservation associated with the submitted revision.
4. RETURNED_FOR_CORRECTION to SUBMITTED recalculates working days and creates a new atomic RESERVE from the latest available balance.
5. SUBMITTED to REJECTED releases the outstanding reservation.
6. SUBMITTED to CANCELLED releases the outstanding reservation.
7. SUBMITTED to APPROVED commits the exact outstanding reservation allocation.
8. Cancelling a DRAFT or RETURNED_FOR_CORRECTION request has no additional balance mutation when no reservation is outstanding.

Leave or permission types that do not reduce the annual leave balance use the same workflow state machine but do not call the annual balance mutation service.

### Transition safety

All transition authorization and balance side effects are enforced server side. UI visibility is not an authorization boundary. A workflow transition and its required balance mutation must succeed or fail atomically where they form one business action.

## PERM-001 - Non-leave permission workflow

Status: PROVISIONAL APPROVED

1. Non-leave permission is modeled as a separate PermissionRequest workflow and is not represented as a LeaveRequest.
2. PermissionRequest reuses the approved M4 workflow primitives and states: DRAFT, SUBMITTED, RETURNED_FOR_CORRECTION, APPROVED, REJECTED, and CANCELLED.
3. The owning Pegawai creates, submits, corrects, resubmits, and may cancel a non-final PermissionRequest according to WF-003 and WF-004 owner-isolation rules.
4. ADMIN_KEPEGAWAIAN may return, approve, or reject a submitted PermissionRequest according to WF-002 and WF-004.
5. Approval requires the supporting evidence applicable to the current hybrid permission process. The physical signed evidence remains the formal supporting basis, while Admin records the application status in SI CUTI.
6. PermissionRequest revisions are immutable and auditable in the same manner as leave-request revisions.
7. PermissionRequest never calls the annual leave balance mutation service and therefore does not create RESERVE, RELEASE, COMMIT, or REVERSAL operations against Cuti Tahunan balances.
8. Specific permission types, duration limits, required-document rules, and other type-specific automatic validation are not inferred under PERM-001 and remain dependent on VAL-001 or later approved policy.
9. TUKIN and disciplinary calculations are not implemented under PERM-001 and remain governed by PERM-002.

## PERM-002 - TUKIN and disciplinary boundary

Status: PROVISIONAL APPROVED

1. SI CUTI does not calculate, determine, or automatically apply TUKIN deductions in the current M4 baseline.
2. SI CUTI does not determine disciplinary violations, disciplinary points, sanctions, or other disciplinary consequences from a PermissionRequest.
3. The source proposal statement that permission may affect TUKIN according to applicable rules and is not counted as discipline is treated as informational context only until an authoritative regulation, deterministic formula, exceptions, process owner, and implementation authority are approved.
4. SI CUTI may retain neutral administrative metadata indicating that an approved permission record may require downstream review or processing outside the current SI CUTI workflow, but such metadata must not itself calculate or assert a financial or disciplinary outcome.
5. No percentage, amount, deduction formula, disciplinary classification, exception, or automated export effect may be hard-coded from assumptions under PERM-002.
6. If a future approved policy places TUKIN or disciplinary processing inside SI CUTI, it must be introduced through an explicit stakeholder-approved amendment with its authoritative source, calculation rules, ownership, audit behavior, correction behavior, and integration boundary.

## Current workflow gate status

WF-001 through WF-004, PERM-001, and PERM-002 are PROVISIONAL APPROVED for the current M4 baseline. They may be superseded later only through an explicit stakeholder-approved amendment with preservation of existing audit history.

VAL-001 remains to be decided before its dependent M4 automatic validation behavior is finalized.
