# SI CUTI — Production login UI polish

Source repository: `XGamingTechnology/si-cuti-kansar-nias`.
Source ref: current staging HEAD at task start, `f1a4280bd743780e978d506f26eaa36700ab4219`.
Feature branch: `codex/login-ui-premium-polish`.
Verification date: 2026-10-13 (Asia/Jakarta).

## Interface and interaction

The production `LoginForm` uses a layered institutional navy panel, restrained orange accents, subtle line geometry, and a floating white authentication card. All new CSS is in `src/components/login-form.css`, scoped to `sign-in-*` classes. Shared global styles, the static preview, and authenticated screens are unchanged. Mobile uses a compact SI CUTI/Kantor SAR Nias header instead of the desktop hero. Short screens can scroll; desktop, tablet portrait/landscape, mobile, and 320px widths were checked for horizontal overflow and accessible controls.

The inline SVG password toggle changes password/text on the same input node, preserves value and pointer focus, supports keyboard activation, and updates its Indonesian aria-label/aria-pressed. Existing autocomplete, required validation, and NIP maxLength=32 are retained.

Floating notifications use an error alert, expired-session warning status, or successful-login status, with a small icon and accessible dismiss control. Text stays generic for authentication failures; backend error bodies are not displayed. Notifications animate only opacity/translate and stay inside the viewport with safe-area positioning. They remain until dismissed or superseded; no intrusive modal or automatic error disappearance is added.

Pending uses a synchronous in-flight guard plus a disabled, fixed-size button, a CSS spinner, and “Memeriksa akun…”. A transport failure restores a retryable form without clearing the password. Success stays locked, shows “Berhasil masuk / Menyiapkan ruang kerja Anda…”, then retains `window.location.assign("/")` after a brief 180ms acknowledgement. Timers are cleaned up on unmount. Reduced-motion disables all login animations/transitions and removes the toast exit delay.

The form still sends exactly `POST /api/auth/login` with JSON NIP and password. Authentication, session validation, cookie issuance/options, API responses, role/authorization logic, schema/migrations, dependencies, and existing server page selection are unchanged. No remember-me, password-strength, or recovery flow is introduced.

## Automated verification

- Changed-file Prettier, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: PASS.
- Focused authentication/authorization/login HTTP gate: 29 tests PASS across 4 files.
- Full `npm test`: 341 unit/HTTP tests PASS across 33 files.
- Browser suite: 13 Chromium scenarios PASS against the built production app, including desktop 1440x900, tablet 834x1112 and 1024x768, mobile 390x844, small mobile 320x568, reduced-motion, and 200% form text sizing.
- Browser checks exercise the real hydrated LoginForm. Login API responses are intercepted for deterministic failure, pending, success, and network scenarios. The expired-session test uses the existing server path with an invalid synthetic session cookie and an isolated PostgreSQL 18.1 database/non-superuser application role.
- New HTTP tests verify the unchanged API response, payload validation, generic errors, and production cookie flags/path/max-age independently of presentation. Existing auth tests verify session expiration/revocation and credentials.

The browser scenarios cover SVG show/hide, input-node/value/focus preservation, keyboard use, no accidental toggle submission, error dismissal/privacy, session warning, duplicate actions, stable button dimensions, exact request payload, success status before the unchanged root navigation, network recovery, responsive bounds, and reduced-motion. Browser tooling is an external test tool; no dependency or lockfile change is required.

## Re-running browser checks

Start the built app with `npm run start -- --hostname 127.0.0.1 --port 3100`. Supply the repository's normal database/private-storage environment configuration. The expired-session scenario requires an initialized disposable PostgreSQL database; do not use employee data from production.

If Playwright is not already available, install the test tool outside the checkout:

```sh
npm install --prefix /tmp/si-cuti-login-browser-tools --no-save --package-lock=false playwright@1.62.1
```

Use an available Chromium binary, or install the browser via that external Playwright tool. Then run:

```sh
SI_CUTI_PLAYWRIGHT_MODULE=/tmp/si-cuti-login-browser-tools/node_modules/playwright \
SI_CUTI_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
SI_CUTI_LOGIN_SCREENSHOTS=/tmp/si-cuti-login-shots \
node tests/browser/login-ui.mjs
```

`SI_CUTI_LOGIN_TEST_URL` can select another local test server. Screenshots are optional and remain outside the checkout. These variables configure the test runner only; they are not application requirements. The success test controls the browser clock to verify the 180ms acknowledgement without a timing race.

## Exact changed files

- `src/components/login-form.tsx`
- `src/components/login-form.css`
- `tests/http/login.test.ts`
- `tests/browser/login-ui.mjs`
- `docs/login-ui-polish.md`

No changes to `src/app/page.tsx`, `src/components/login-preview.tsx`, `src/app/styles.css`, `src/app/api/auth/login/route.ts`, authentication/session/authorization code, `prisma/schema.prisma`, `prisma/migrations`, `package.json`, or `package-lock.json`. Next.js's incidental generated type/config rewrites were restored after the build. No deployment or merge is performed.
