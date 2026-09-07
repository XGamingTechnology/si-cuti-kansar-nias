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

## Pending

WF-004 state machine and transition permissions remain to be decided before implementation is finalized.
