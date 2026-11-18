# Volunteer app test plan

**Status:** Approved. P0 and P1 coverage implemented as listed below. P2 and P3 remain open.

## Scope and existing setup

Reviewed [CODEBASE_MAP.md](CODEBASE_MAP.md), [AUDIT.md](AUDIT.md), local `AGENTS.md`, the router, and the test configuration. P0 covers volunteer-facing auth, role browsing, signup, waiver, and clinic registration. P1 adds regression coverage for audit findings involving authorization, data integrity, notifications, and migration safety. P2 covers pure logic. P3 covers the production build and local preview.

The app has no identified checkout or payment flow. Live projects, real email delivery, Slack, Google Sheets, production scheduling, and actual deployment are outside automated scope. Visual redesign, load testing, and application fixes are also outside this change.

[package.json](package.json) already provides `npm test` using Playwright, plus UI, headed, debug, and report scripts. [playwright.config.js](playwright.config.js) starts Vite on port 5173, runs Chromium with one worker, and configures HTML output and CI retries. [tests/](tests/) has auth and full-auth-flow specs. Some cover standalone signup and password-reset routes absent from [src/App.svelte](src/App.svelte). Existing test documentation describes shared Supabase state and manual cleanup, so validate and replace those assumptions before running anything. The checked-in [GitHub workflow](.github/workflows/nica-coach-digest-cron.yml) schedules the NICA digest. GitHub Actions runs the scheduled digest. Run tests locally.

## Test tools and isolation

- Keep the locked Playwright and Chromium setup for browser E2E tests and the top-level test command. Use the Node test runner for pure JavaScript in P2. No new npm framework is proposed.
- Start a dedicated loopback Vite server with synthetic Supabase configuration. Do not reuse an existing server. Install browser request interception before navigation, serve explicit Auth, REST, RPC, and Edge Function fixtures, block service workers, and fail on unexpected network traffic. Use synthetic accounts and reset state per test.
- For P1, exercise actual Edge handler behavior under Deno with stubbed Auth, PostgREST, Resend, and Slack. Pin imports in the test harness or use locally prepared dependencies and restrict test runtime network access to loopback. Run real policy and migration checks on a disposable local Supabase/PostgreSQL instance with synthetic identities and fixtures. Browser mocks alone cannot establish database enforcement.
- Keep all output in ignored test directories. In Phase 3, replace or adapt the existing live-dependent specs, add a test-only runner or setup for the local prerequisites, and make `npm test` run all implemented items. Fail clearly when a required harness cannot start.
- Mark a narrowly scoped assertion as expected to fail only after a repeatable assertion failure confirms an existing bug. Add the audit ID and source location beside it. Setup failures, unknown fixtures, and blocked environments count as failures or explicit blockers. An unexpected pass should require removing the expected-failure marker.

## P0 · Critical user flows

| ID | Behavior | Type and proposed file | Mocks | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Request a magic link, complete login, restore a session, and sign out. Cover invalid email, delivery failure, and volunteer, leader, and admin landing paths. | E2E · `tests/auth/login.spec.js`, `tests/integration/full-auth-flow.spec.js` | Mail request, callback/session, profile, and related bootstrap reads | Invalid input does not send. Pending submit prevents duplicates. Success and failure show the right state. Accepted session survives reload, lands at the supported destination, and clears on sign-out. | Covered. Reload preserves a restored session and signed-out visitors redirect to login. |
| P0-02 | Browse volunteer roles, load fill counts, filter, and open a signup. Cover loading, empty, and failed data reads. | E2E · `tests/volunteer/browse-roles.spec.js` | Role list, count RPC, and role details | Counts and filtered rows match fixtures. Loading resolves, empty and failed responses avoid a false list, and the chosen role opens. | Covered. |
| P0-03 | Volunteer signup for a new or returning user, including email verification and role return, waiver and emergency-contact steps, and cancellation. | E2E · `tests/volunteer/signup.spec.js` | Auth/session, profiles, roles, waiver settings, signup writes, fallback, and email | Required fields prevent submission when missing. An accepted signup appears once in My Signups. Duplicate, closed, and failed requests never show false success. Cancellation updates the displayed assignment. | Covered for guest pending and immediate sessions, verification return, signed-in confirmation, existing signup, failure, and cancellation. |
| P0-04 | Kids’ clinic registration with parent details, child details, waiver consent, and confirmation status. | E2E · `tests/volunteer/kids-clinic.spec.js` | Clinic Edge Function response | Invalid input sends no request. Accepted registration sends one request and shows success. Delivery failure shows a warning. Rejected registration allows correction and retry. | Covered. |

## P1 · Audit regression coverage

| ID | Audit reference and behavior | Type and proposed file | Mocks or fixtures | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P1-01 | SEC-02, SEC-05 · Organizer email, public magic-link request, redirect handling, and abuse controls. | Handler integration · `tests/edge/email-auth.test.ts` | Stubbed identity, Auth link generation, and mail transport | Public login still works. Disallowed generic and welcome sends do not reach the transport. The expected public request limit and approved redirect behavior are enforced. | Partial. Public login, organizer-only link preparation, generic acknowledgement, and provider error redaction covered. Generic relay and welcome authorization, rate-limit thresholds, and redirect policy remain open. |
| P1-02 | SEC-03, SEC-04 · Profile and directory access for anonymous, volunteer, leader, and admin identities. Include legitimate own-profile editing and restricted fields. | Database integration · `tests/database/profile-access.sql` | Synthetic identities, profiles, and assignments on local PostgreSQL | Authorized reads and edits succeed. Restricted fields, role changes, and directory access are denied according to the agreed access matrix. Confirm the intended anonymous directory policy before locking in its assertion. | Partial. Local own-profile edit covered. Full directory and role access matrix remains open pending intended policy and baseline grants. |
| P1-03 | SEC-06, REL-01 · Signup identity, capacity, waiver transaction, reactivation, and retries. | Handler and database integration · `tests/edge/signup-integrity.test.ts`, `tests/database/migrations.spec.js` | Synthetic session/proof and provider responses, disposable DB with seeded roles and waivers | Unauthorized writes are refused. Competing last-seat signups cannot both confirm if capacity is enforced. Rejected waiver or reactivation writes do not return success. Repeating a request does not duplicate records. | Covered locally. Tests verify session enforcement, concurrent last-seat allocation, waiver rollback, cancelled reactivation, and retry behavior. |
| P1-04 | DEP-01, DEP-03 · Clean setup, existing-schema upgrade, and the scope of manual cleanup SQL. | Database integration · `tests/database/migrations.sql`, `tests/database/cleanup-scope.sql` | Disposable databases, synthetic prior schema and roster. No remote project. | The documented sequence yields required tables and policies on both baselines, or a narrowly scoped expected failure identifies the missing prerequisite. Cleanup affects only selected fixtures and expected cascades. | Covered on disposable PostgreSQL. Documented bootstrap is an expected failure, while a manually patched baseline preserves existing data and passes migration and cleanup checks. |
| P1-05 | REL-02, REL-03, DEV-02 · Organizer and leader assignment paths, partial failure, and notification delivery. | E2E and handler integration · `tests/organizer/assignment.spec.js`, `tests/edge/notifications.test.ts` | Role-scoped fixtures, stubbed database, Slack and mail. Inject time for scheduled behavior. | Authorized assignments appear once. Denied or failed operations show actionable states. Provider rejection produces an observable outcome, and successful signup sends at most one notification per channel. | Partial. Organizer assignment, leader roster, one welcome request, and disabled daily digest covered. The organizer browser no longer makes a second Slack request. Leader write and scheduler alert coverage remain open. |
| P1-06 | SEC-08 · Clinic server-side validation, duplicate registration, and delivery failure after acceptance. | Handler and database integration · `tests/edge/kids-clinic.test.ts`, `tests/database/migrations.spec.js` | Stubbed mail and local registration data | Invalid input writes nothing. Retry does not duplicate an accepted registration. Mail failure does not misrepresent whether the registration was saved. | Covered locally. Duplicate reservations, parent request limits, write rejection, and provider failure pass. |
| P1-07 | SEC-07 · Browser PDF export before dependency upgrades. | Smoke · `tests/organizer/pdf-export.spec.js` | Fixed affiliation and roster data. Use real local PDF generation. | Export downloads a valid PDF with the expected filename and representative roster data. | Covered. |
| P1-08 | TEST-01, DEV-03 · Replace stale route expectations and prove the supported auth and signup contracts before legacy cleanup. | E2E and suite wiring · P0 auth and signup specs, `playwright.config.js` | Same browser fixtures as P0 | Active auth and signup tests run locally from `npm test`. No legacy test attempts an old route or connects to a shared backend. | Covered locally. GitHub Actions workflow added. Hosted tests passed previously. Automatic GitHub tests were removed. Run the suite locally. |

## P2 · Pure logic

| ID | Behavior | Type and proposed file | Mocks | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P2-01 | CSV parsing and validation in `src/lib/utils/csvParser.js`. | Unit · `tests/unit/csv-parser.test.js` | None. Inline CSV fixtures. | Quoted fields and valid rows parse. Invalid headers and rows produce actionable errors. | Open. |
| P2-02 | Pacific date and role schedule formatting in `src/lib/utils/timeDisplay.js`. | Unit · `tests/unit/time-display.test.js` | Fixed time where needed. | Pacific day boundaries, daylight saving transitions, flexible schedules, and completion months produce the expected dates and sorting. | Open. |
| P2-03 | Critical staffing and NICA calculations in `src/lib/utils/criticalSpots.js` and `src/lib/nicaSpotMath.js`. | Unit · `tests/unit/staffing.test.js` | None. Synthetic roles and affiliations. | Legacy and incomplete role data, bounds, weighted spots, and affiliation grouping agree with examples. | Open. |
| P2-04 | Timeout and feature gating in `src/lib/utils/withTimeout.js` and `src/lib/contactsAvailability.js`. | Unit · `tests/unit/boundaries.test.js` | Controlled timers and fixed timestamps. | Successful requests resolve, overdue requests produce the expected timeout, and the feature flag changes at the stated cutoff. | Open. |

## P3 · Build and deploy smoke checks

| ID | Behavior | Type and proposed file | Mocks | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P3-01 | Clean lockfile install, supported Node runtime, production build, and local preview boot. | Smoke · `tests/smoke/build.spec.js` | Synthetic build-time environment and blocked provider traffic. | Vite creates the build. The preview serves its assets and renders the app without startup errors. | Run the build locally. Automated preview boot remains open. |
| P3-02 | Key route rendering, internal links, static assets, and Vercel rewrite configuration. | Smoke · `tests/smoke/routes.spec.js` | Explicit REST and Auth responses. External URLs are checked as references only. | Home, login, volunteer, kids, and organizer entry paths render in the built preview. Internal links and assets resolve. Rewrite assertions cover `/volunteer` and SPA fallback. | Open. |

## MG · Minor volunteers and parent/guardian consent

**Status:** Implemented and verified offline. Known regressions and verified policy checks are listed below.

Role signups use event-day age when the role has a date. The standalone form asks age at signing, and the database uses the signing date for undated roles. A parent or legal guardian signs for minors. That consent can be given in four places:

- **Role page, signed in:** [Signup.svelte](src/routes/volunteer/Signup.svelte) at `/#/signup/:id` sends consent to `confirm_volunteer_signup`.
- **Role page, guest form:** [Signup.svelte](src/routes/volunteer/Signup.svelte) sends it through `createVolunteerAndSignup` in [volunteerSignup.js](src/lib/volunteerSignup.js).
- **Browse roles, details modal:** [BrowseRoles.svelte](src/routes/volunteer/BrowseRoles.svelte) uses the same `createVolunteerAndSignup` helper.
- **Standalone waiver:** [SignWaiver.svelte](src/routes/volunteer/SignWaiver.svelte) at `/#/volunteer/waiver`, used by volunteers that an organizer or leader added. It calls `sign_volunteer_waiver` through [waiver.js](src/lib/stores/waiver.js).

Guardian data is stored in the `waivers` columns that [20260125000000_add_waiver_parent_columns.sql](supabase/migrations/20260125000000_add_waiver_parent_columns.sql) adds. The [shared waiver migration](supabase/migrations/20261118000300_enforce_shared_volunteer_waiver_policy.sql) applies the same validation to both signing operations. Waivers without an age declaration are retained as history and must be re-collected when a current waiver is needed. The kids' clinic flow (P0-04, P1-06) is a different feature and is outside this section.

Use the P0 browser fixtures and the P1 disposable PostgreSQL harness with synthetic minors and guardians, such as `guardian@example.invalid`. Assert email requests at the intercepted `send-email` boundary. Do not use real names or addresses.

| ID | Behavior | Type and proposed file | Mocks or fixtures | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| MG-01 | Under-18 toggle and client validation at all four entry points. | E2E · `tests/volunteer/minor-consent.spec.js` | Waiver settings, role, and session fixtures. | Declaring minor status shows the guardian section. Submit stays disabled, and no request is sent, until guardian name, email, and signature are present; whitespace counts as missing. Phone stays optional. Adults still need their own signature. If the box is checked, filled in, then unchecked, no guardian fields are sent. | Passed. All four forms and adult reset covered. |
| MG-02 | Signed-in role signup by a minor. | E2E · `tests/volunteer/minor-consent.spec.js` | `confirm_volunteer_signup` RPC and `send-email` interception. | The RPC receives `is_minor: true`, guardian fields, and the current waiver version. MG-07 verifies trimming when stored. When `created` is true, the page sends one volunteer email and one guardian email that names the role and date. When `created` is false, it sends neither email. A rejected RPC shows the error and sends no email. | Passed. Submission and notification behavior covered. PostgreSQL trims stored guardian fields in MG-07. |
| MG-03 | Signed-in minor assent, blank or explicitly provided. | E2E and database · `tests/volunteer/minor-consent.spec.js`, `tests/database/migrations.spec.js` | Same as MG-02, plus the real RPC on disposable PostgreSQL. | Complete guardian consent confirms signup with or without assent. The database stores absent assent as null and stores explicit assent separately from the guardian signature. An adult still needs a signature. | Passed offline. [#39](https://github.com/paulhainsworth/volunteer/issues/39) |
| MG-04 | Guest and details-modal signup by a minor with an immediate session. | E2E · `tests/volunteer/minor-consent.spec.js` | Auth `signUp` that returns a session, RPC, and `send-email`. | The RPC consent leaves `signature_name` empty for a minor and carries the guardian fields. The seat confirms. The guardian email is sent once, with role details. | Passed for both guest entry points. |
| MG-05 | Guest signup by a minor when email verification is pending. | E2E · `tests/volunteer/minor-consent.spec.js` | Auth `signUp` without a session, then a verification callback. | Before verification, no seat, waiver, or guardian email is created. After the callback returns the volunteer to the role, the guardian section is offered again and the seat confirms only after complete consent. Document that guardian entries made before verification are not kept. | Passed. Guardian fields must be entered again after verification. |
| MG-06 | Standalone waiver page for a minor. | E2E · `tests/volunteer/minor-consent.spec.js` | Waiver settings, signing RPC, and email. | Current version, declared minor status, optional assent, and guardian details are submitted. Success sends one guardian email and returns to the requested page. A rejected save shows the error, sends no email, and stays on the page. | Passed offline. |
| MG-07 | `confirm_volunteer_signup` enforces guardian consent. | Database · `tests/database/migrations.spec.js` | Synthetic volunteer, role, and waiver settings. | With `is_minor` true, a missing or whitespace-only guardian name, email, or signature raises "Parent or guardian consent is required". It writes no waiver and no seat. Complete consent stores trimmed values, stores a blank phone as null, and sets `parent_signed_at`. Adult consent leaves the guardian columns null. A repeat call after confirmation returns `created: false` and adds no second waiver. | Passed. Verified required guardian fields, rollback, stored values, and retries. |
| MG-08 | Shared age declaration and standalone guardian rules. | E2E and database · `tests/volunteer/minor-consent.spec.js`, `tests/database/migrations.spec.js` | Synthetic accounts, a dated role, and current and legacy waivers. | Complete adult or minor consent satisfies the waiver check and can be reused for an eligible role. An undeclared age or incomplete guardian consent is rejected. A legacy waiver prompts re-signing and stays in history. | Passed offline. [#42](https://github.com/paulhainsworth/volunteer/issues/42) |
| MG-09 | Guardian email content and failure handling. | E2E and handler · `tests/volunteer/minor-consent.spec.js`, `tests/edge/notifications.test.ts` | `send-email` returns 500. Names include `<b>` and `&`. | A failed guardian email does not change signup or waiver success. Console output contains no guardian or volunteer contact details and no provider response body. Names are HTML-escaped in the email body. `send-email` forwards caller HTML unchanged, so mark the escaping assertion as an expected failure ([volunteerSignup.js:120](src/lib/volunteerSignup.js#L120)) until names are escaped. | Mail failure preserves signup confirmation. HTML escaping and provider-error redaction are expected failures. [#40](https://github.com/paulhainsworth/volunteer/issues/40), [#41](https://github.com/paulhainsworth/volunteer/issues/41) |

**How to run:** use `npx --no-install playwright test tests/volunteer/minor-consent.spec.js` for the browser rows and `npm test` for the full suite, including database and Deno rows. A pass means every MG row passes, or fails only on a recorded expected-failure marker, with no unexpected network traffic.

The MG run recorded **15 passes and three expected failures**. The full offline suite recorded **59 passes, four expected failures, and zero unexpected failures**. The extra expected failure is the existing bootstrap gap.

## Risks and gaps

- Database integration uses PostgreSQL 17 and a minimal local Auth schema rather than the full Supabase stack. It verifies repository SQL and selected policy behavior. Hosted gateway and Auth runtime behavior remain open.
- Deployment parity depends on the effective production grants, migration baseline, Auth redirect allowlist, and scheduler settings. Local tests validate checked-in behavior and explicit fixtures. Production configuration needs separate verification.
- The intended scope of public directory fields, permitted administrator capacity overrides, and the exact rate-limit policy need confirmation before making those expectations release gates. Tests can establish the supported paths and flag the unresolved cases.
- Minor status is self-declared and is not stored. No age or date of birth is checked, and the guardian email is not verified. Organizers cannot currently see guardian contact details in any admin view. These are product decisions that MG tests can flag but not settle.
- No real mail receipt, account identity, provider delivery, browser/device matrix beyond Chromium, or live Vercel rewrite is covered. The suite does not exercise live infrastructure.

## How to run

Use a Node release supported by the lockfile, such as Node 22.12 or newer on the Node 22 line. The install commands are one-time setup. Package, browser, and local-image downloads are setup traffic. Test flows use loopback or in-process fakes. The runner starts and removes its own database container. Deno maps remote imports to local stubs and has no network permission.

```sh
npm ci
npx --no-install playwright install chromium
docker pull postgres:17-alpine
npm test
```

Use these commands for a browser-only diagnostic run after the fixture configuration lands.

```sh
npx --no-install playwright test tests/auth tests/integration tests/volunteer tests/organizer
npm run test:report
```

When P2 and P3 land, the component commands will be available individually as well.

```sh
node --test tests/unit/*.test.js
npm run build
npx --no-install playwright test tests/smoke
```

## Baseline run results

`npm test` exited successfully with **30 passes, 0 unexpected failures, and 5 expected failures**. Playwright had 21 passes and two expected failures. Deno had nine passes and three assertions labeled `xfail`. The Deno runner reports a matched known regression as successful. The assertions fail if the known regression changes, so the marker and assertion can be updated together.

| Source | Confirmed regression |
| --- | --- |
| [src/routes/volunteer/MySignups.svelte:25](src/routes/volunteer/MySignups.svelte#L25) | A reload can redirect a signed-in volunteer to login before Auth bootstrap restores the session. |
| [Signup policy migration, line 22](supabase/migrations/20260331000100_allow_admin_and_leader_signup_updates.sql#L22) | The documented bootstrap lacks the leader-domain relation required by this migration. |
| [New-user signup handler, line 114](supabase/functions/create-signup-for-new-user/index.ts#L114) | A failed cancelled-signup reactivation can return success. |
| [New-user signup handler, line 152](supabase/functions/create-signup-for-new-user/index.ts#L152) | A failed guardian-waiver insert can return signup success. |
| [Clinic signup handler, line 143](supabase/functions/submit-kids-clinic-signup/index.ts#L143) | Retrying the same accepted registration inserts a duplicate row. |

## Login fix verification

- Targeted Chromium login, session, and signup run completed with 13 passes.
- Full offline suite completed with 35 passes, four expected failures, and zero unexpected failures. The My Signups reload regression now passes.
- Mocked Edge tests cover welcome and magic-link provider error redaction and the public acknowledgement when no account exists. Production delivery and the remaining authorization, redirect, and rate-limit policies are outside this run.

## Signup fix verification

- The full offline suite passed with 42 passes, one expected failure, and zero unexpected failures. The remaining expected failure tracks the pre-existing database bootstrap gap.
- Disposable PostgreSQL verified last-seat contention, cancelled assignment reactivation, required waiver rollback, retry idempotency, and clinic deduplication and limits. Edge and browser tests used synthetic sessions and mocked providers.
- The production frontend build passed. Production migration history, Auth redirects, and hosted mail and Slack delivery still require release verification.

Apply both signup migrations before deploying the updated Edge Functions and frontend. Verify the account-confirmation redirect and hosted delivery with approved test accounts. If the event requires proof of email ownership, confirm that Supabase Auth requires email confirmation.
