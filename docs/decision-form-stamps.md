# Decision markers on signed forms

Approved user direction, 15 October 2026: retain the employee-uploaded signed form and put the
recorded SI CUTI outcome on the appropriate area of a derived copy. Decision reason/date come
from the immutable decision snapshot. This is a system record marker, not an electronic signature,
an official agency seal, or an inferred second decision from a supervisor. VII and VIII are never
both automatically approved from a single Admin action.

## Admin flow

After a final decision with a pinned source, choose **Atur Penanda pada Formulir**. Select the
source page and top/left/width/height percentages, request a private PDF preview, then verify
identity, NIP, period and placement before saving. Editing coordinates clears the preview and
confirmation. The server checks page/crop/rotation bounds, actual source checksum, actor, payload
and preview fingerprint. The human verification is required; no OCR match is claimed. Scans that
are skewed may need manual positioning; arbitrary PDF page rotations beyond multiples of 90
are rejected. Browser PDF support may vary; the preview can also be opened in a separate tab.

A saved edition places the source form first with the marker, followed by a readable decision
appendix. The reason is shown in full in the appendix, and the rejection marker points to it.
The marker labels the WIB time as the time recorded and names the Admin recorder; it does not
claim the recorder is the authorized official signer. Coordinates use the displayed crop area,
including rotated scans. Only the selected page receives the marker; signatures/text must remain
clear as verified by Admin. A preview that cannot fit the full recorder name legibly asks for a
larger marker area before it can be saved.

The original application PDF/form layout is not redesigned by this change. Existing source pages,
including their signature and decision boxes, remain byte-for-byte preserved in storage; only a
derived edition adds the requested marker. The bundled sample UAT images are not a substitute for
the employee's actual signed scan when checking a reported layout defect.

## Future electronic-signature integration (TTE)

TTE is a separate future project. Design decisions include the provider API, provider-verified signer
identity, certificate and revocation checks, trusted timestamp, and proof that the signature covers
the final PDF bytes. SI CUTI must not synthesize a signature, borrow an Admin recorder's identity as
the authorized signer, or keep private signing keys. Until a provider and signer authorization path
are selected and implemented, the SI CUTI marker remains an administrative record only; an uploaded
manually signed scan remains unchanged.

## Preserved records

Original scan bytes and the original generated artifact stay unchanged. Each saved edition is
an append-only private PDF record with archive/version, creator/time, verification, source/output
checksums, renderer version, stable command key and payload hash. Saving a new position makes
a new version. The default download uses the latest edition; previous editions remain accessible
through authorized links. It never repeats approval/rejection or any balance mutation.

## API and persistence

- POST `/api/workflow/leave/:id/decision/editions/preview`: Admin-only byte preview, no file/DB writes.
- POST `/api/workflow/leave/:id/decision/editions`: Admin verification and stable UUID key, atomic version allocation under archive row lock.
- GET `/api/workflow/leave/:id/decision/document?edition=:editionId`: Admin/owner only, checksum checked, private/no-store.
- Existing decision metadata exposes sanitized edition links/placement/time, never storage keys.

Forward migration `20261015100000_leave_decision_editions` adds one table, unique indexes and
restrictive foreign keys plus positive version/size checks. Existing migrations, decision snapshots
and balance tables are unchanged. This requires an explicit staging migration and backup before
app rollout; it is not an app-only update. No deployment is performed by this PR.

## Status-feedback correction

Opening another request clears prior feedback/review state. Detail loading has a sequence/selected-ID
guard so old responses cannot replace a newer request. Action refresh and message writes also check
the selected request. Outcome panels stay keyed by request/status.

## Verification

Local lint, typecheck and production build passed. 377 unit/HTTP tests passed, including bounds,
rotated/cropped PDF page preservation, unchanged source bytes, read-only preview, authorization,
replay, fingerprint checks, edition history and storage cleanup. Twelve isolated React/Chromium
scenarios passed with synthetic intercepted APIs, including the real workflow component switching
from rejection to another request and late detail responses. Approved/rejected sample PDFs were
rendered and visually checked using synthetic data. These browser scenarios are not database E2E.

The PostgreSQL suite adds real concurrent edition creation, stable replay/version history, stored
verification/checksums and unchanged decision metadata/original artifact. PR #106 Quality Gate
passed with 377 unit/HTTP and 92 PostgreSQL integration tests. The merge was deployed to staging
on 15 October 2026 WIB, including the new migration, healthy app and internal live/ready HTTP 200.
The user then reported the result was okay. This is scoped feedback, not evidence that every
browser/authorization/rotation/mobile UAT case was executed. Public HTTPS checks remain unreported.
See `docs/staging-checkpoint-20261015.md` for exact deployment provenance and remaining checks.
