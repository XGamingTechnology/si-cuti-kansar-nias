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

## Pending

WF-003 correction and resubmission behavior, and WF-004 state machine and transition permissions remain to be decided before implementation is finalized.
