# Volunteer app test plan

**Status:** Approved. P0 and P1 coverage implemented as listed below. P2 and P3 remain open.

## Scope and existing setup

Reviewed [CODEBASE_MAP.md](CODEBASE_MAP.md), [AUDIT.md](AUDIT.md), local `AGENTS.md`, the router, and the test configuration. P0 covers volunteer-facing auth, role browsing, signup, waiver, and clinic registration. P1 adds regression coverage for audit findings involving authorization, data integrity, notifications, and migration safety. P2 covers pure logic. P3 covers the production build and local preview.

The app has no identified checkout or payment flow. Live projects, real email delivery, Slack, Google Sheets, production scheduling, and actual deployment are outside automated scope. Visual redesign, load testing, and application fixes are also outside this change.

[package.json](package.json) already provides `npm test` using Playwright, plus UI, headed, debug, and report scripts. [playwright.config.js](playwright.config.js) starts Vite on port 5173, runs Chromium with one worker, and configures HTML output and CI retries. [tests/](tests/) has auth and full-auth-flow specs. Some cover standalone signup and password-reset routes absent from [src/App.svelte](src/App.svelte). Existing test documentation describes shared Supabase state and manual cleanup, so validate and replace those assumptions before running anything. The checked-in [GitHub workflow](.github/workflows/nica-coach-digest-cron.yml) schedules the NICA digest. There is no checked-in test CI workflow.

## Test tools and isolation

- Keep the locked Playwright and Chromium setup for browser E2E tests and the top-level test command. Use the Node test runner for pure JavaScript in P2. No new npm framework is proposed.
- Start a dedicated loopback Vite server with synthetic Supabase configuration. Do not reuse an existing server. Install browser request interception before navigation, serve explicit Auth, REST, RPC, and Edge Function fixtures, block service workers, and fail on unexpected network traffic. Use synthetic accounts and reset state per test.
- For P1, exercise actual Edge handler behavior under Deno with stubbed Auth, PostgREST, Resend, and Slack. Pin imports in the test harness or use locally prepared dependencies and restrict test runtime network access to loopback. Run real policy and migration checks on a disposable local Supabase/PostgreSQL instance with synthetic identities and fixtures. Browser mocks alone cannot establish database enforcement.
- Keep all output in ignored test directories. In Phase 3, replace or adapt the existing live-dependent specs, add a test-only runner or setup for the local prerequisites, and make `npm test` run all implemented items. Fail clearly when a required harness cannot start.
- Mark a narrowly scoped assertion as expected to fail only after a repeatable assertion failure confirms an existing bug. Add the audit ID and source location beside it. Setup failures, unknown fixtures, and blocked environments count as failures or explicit blockers. An unexpected pass should require removing the expected-failure marker.

## P0 · Critical user flows

| ID | Behavior | Type and proposed file | Mocks | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Request a magic link, complete login, restore a session, and sign out. Cover invalid email, delivery failure, and volunteer, leader, and admin landing paths. | E2E · `tests/auth/login.spec.js`, `tests/integration/full-auth-flow.spec.js` | Mail request, callback/session, profile, and related bootstrap reads | Invalid input does not send. Pending submit prevents duplicates. Success and failure show the right state. Accepted session survives reload, lands at the supported destination, and clears on sign-out. | Covered. Reload on My Signups is an expected failure. |
| P0-02 | Browse volunteer roles, load fill counts, filter, and open a signup. Cover loading, empty, and failed data reads. | E2E · `tests/volunteer/browse-roles.spec.js` | Role list, count RPC, and role details | Counts and filtered rows match fixtures. Loading resolves, empty and failed responses avoid a false list, and the chosen role opens. | Covered. |
| P0-03 | Volunteer signup for a new or returning user, including email-confirmation fallback, waiver and emergency-contact steps, and cancellation. | E2E · `tests/volunteer/signup.spec.js` | Auth/session, profiles, roles, waiver settings, signup writes, fallback, and email | Required fields prevent submission when missing. An accepted signup appears once in My Signups. Duplicate, closed, and failed requests never show false success. Cancellation updates the displayed assignment. | Covered for guest fallback, successful signed-in signup, existing signup, rejected submission, and cancellation. |
| P0-04 | Kids’ clinic registration with parent details, child details, waiver consent, and confirmation status. | E2E · `tests/volunteer/kids-clinic.spec.js` | Clinic Edge Function response | Invalid input sends no request. Accepted registration sends one request and shows success. Delivery failure shows a warning. Rejected registration allows correction and retry. | Covered. |

## P1 · Audit regression coverage

| ID | Audit reference and behavior | Type and proposed file | Mocks or fixtures | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| P1-01 | SEC-02, SEC-05 · Organizer email, public magic-link request, redirect handling, and abuse controls. | Handler integration · `tests/edge/email-auth.test.ts` | Stubbed identity, Auth link generation, and mail transport | Public login still works. Disallowed generic and welcome sends do not reach the transport. The expected public request limit and approved redirect behavior are enforced. | Partial. Public login and organizer-only link preparation covered. Generic relay and welcome authorization, rate-limit thresholds, and redirect policy remain open. |
| P1-02 | SEC-03, SEC-04 · Profile and directory access for anonymous, volunteer, leader, and admin identities. Include legitimate own-profile editing and restricted fields. | Database integration · `tests/database/profile-access.sql` | Synthetic identities, profiles, and assignments on local PostgreSQL | Authorized reads and edits succeed. Restricted fields, role changes, and directory access are denied according to the agreed access matrix. Confirm the intended anonymous directory policy before locking in its assertion. | Partial. Local own-profile edit covered. Full directory and role access matrix remains open pending intended policy and baseline grants. |
| P1-03 | SEC-06, REL-01 · Signup identity, capacity, waiver transaction, reactivation, and retries. | Handler and database integration · `tests/edge/signup-integrity.test.ts`, `tests/database/signup-integrity.sql` | Synthetic session/proof and provider responses, disposable DB with seeded roles and waivers | Unauthorized writes are refused. Competing last-seat signups cannot both confirm if capacity is enforced. Rejected waiver or reactivation writes do not return success. Repeating a request does not duplicate records. | Partial. Valid registration and missing input covered. Failed reactivation and failed waiver persistence are expected failures. Ownership proof, concurrent capacity, and transaction-level rollback remain open. |
| P1-04 | DEP-01, DEP-03 · Clean setup, existing-schema upgrade, and the scope of manual cleanup SQL. | Database integration · `tests/database/migrations.sql`, `tests/database/cleanup-scope.sql` | Disposable databases, synthetic prior schema and roster. No remote project. | The documented sequence yields required tables and policies on both baselines, or a narrowly scoped expected failure identifies the missing prerequisite. Cleanup affects only selected fixtures and expected cascades. | Covered on disposable PostgreSQL. Documented bootstrap is an expected failure, while a manually patched baseline preserves existing data and passes migration and cleanup checks. |
| P1-05 | REL-02, REL-03, DEV-02 · Organizer and leader assignment paths, partial failure, and notification delivery. | E2E and handler integration · `tests/organizer/assignment.spec.js`, `tests/edge/notifications.test.ts` | Role-scoped fixtures, stubbed database, Slack and mail. Inject time for scheduled behavior. | Authorized assignments appear once. Denied or failed operations show actionable states. Provider rejection produces an observable outcome, and successful signup sends at most one notification per channel. | Partial. Organizer assignment, leader roster, one welcome request, and disabled daily digest covered. Leader write, cross-function deduplication, and scheduler/provider-alert coverage remain open. |
| P1-06 | SEC-08 · Clinic server-side validation, duplicate registration, and delivery failure after acceptance. | Handler integration · `tests/edge/kids-clinic.test.ts` | Stubbed registration storage and mail transport | Invalid input writes nothing. Retry does not duplicate an accepted registration. Mail failure does not misrepresent whether the registration was saved. | Covered for consent, write rejection, and mail failure. Duplicate registration is an expected failure. |
| P1-07 | SEC-07 · Browser PDF export before dependency upgrades. | Smoke · `tests/organizer/pdf-export.spec.js` | Fixed affiliation and roster data. Use real local PDF generation. | Export downloads a valid PDF with the expected filename and representative roster data. | Covered. |
| P1-08 | TEST-01, DEV-03 · Replace stale route expectations and prove the supported auth and signup contracts before legacy cleanup. | E2E and suite wiring · P0 auth and signup specs, `playwright.config.js`, `.github/workflows/tests.yml` | Same browser fixtures as P0 | Active auth and signup tests run from `npm test`. No legacy test attempts an old route or connects to a shared backend. CI runs the same command. | Covered locally. GitHub Actions workflow added. Hosted execution remains unverified. |

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
| P3-01 | Clean lockfile install, supported Node runtime, production build, and local preview boot. | Smoke · `tests/smoke/build.spec.js` | Synthetic build-time environment and blocked provider traffic. | Vite creates the build. The preview serves its assets and renders the app without startup errors. | Open. |
| P3-02 | Key route rendering, internal links, static assets, and Vercel rewrite configuration. | Smoke · `tests/smoke/routes.spec.js` | Explicit REST and Auth responses. External URLs are checked as references only. | Home, login, volunteer, kids, and organizer entry paths render in the built preview. Internal links and assets resolve. Rewrite assertions cover `/volunteer` and SPA fallback. | Open. |

## Risks and gaps

- Database integration uses PostgreSQL 17 and a minimal local Auth schema rather than the full Supabase stack. It verifies repository SQL and selected policy behavior. Hosted gateway and Auth runtime behavior remain open.
- Deployment parity depends on the effective production grants, migration baseline, Auth redirect allowlist, and scheduler settings. Local tests validate checked-in behavior and explicit fixtures. Production configuration needs separate verification.
- The intended scope of public directory fields, permitted administrator capacity overrides, and the exact rate-limit policy need confirmation before making those expectations release gates. Tests can establish the supported paths and flag the unresolved cases.
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

## Run results

`npm test` exited successfully with **30 passes, 0 unexpected failures, and 5 expected failures**. Playwright had 21 passes and two expected failures. Deno had nine passes and three assertions labeled `xfail`. The Deno runner reports a matched known regression as successful. The assertions fail if the known regression changes, so the marker and assertion can be updated together.

| Source | Confirmed regression |
| --- | --- |
| [src/routes/volunteer/MySignups.svelte:25](src/routes/volunteer/MySignups.svelte#L25) | A reload can redirect a signed-in volunteer to login before Auth bootstrap restores the session. |
| [Signup policy migration, line 22](supabase/migrations/20260331000100_allow_admin_and_leader_signup_updates.sql#L22) | The documented bootstrap lacks the leader-domain relation required by this migration. |
| [New-user signup handler, line 114](supabase/functions/create-signup-for-new-user/index.ts#L114) | A failed cancelled-signup reactivation can return success. |
| [New-user signup handler, line 152](supabase/functions/create-signup-for-new-user/index.ts#L152) | A failed guardian-waiver insert can return signup success. |
| [Clinic signup handler, line 143](supabase/functions/submit-kids-clinic-signup/index.ts#L143) | Retrying the same accepted registration inserts a duplicate row. |
