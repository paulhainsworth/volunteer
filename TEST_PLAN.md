# Volunteer app test plan

**Status:** Approved. P0 and P1 coverage implemented as listed below. P2 and P3 remain open.

## Scope and existing setup

Reviewed [CODEBASE_MAP.md](CODEBASE_MAP.md), [AUDIT.md](AUDIT.md), local `AGENTS.md`, the router, and the test configuration. P0 covers volunteer-facing auth, role browsing, signup, waiver, and clinic registration. P1 adds regression coverage for audit findings involving authorization, data integrity, notifications, and migration safety. P2 covers pure logic. P3 covers the production build and local preview.

The app has no identified checkout or payment flow. Live projects, real email delivery, Slack, Google Sheets, production scheduling, and actual deployment are outside automated scope. Visual redesign, load testing, and application fixes are also outside this change.

[package.json](package.json) provides `npm test` for the offline Playwright and Deno suites, plus UI, headed, debug, and report commands. [playwright.config.js](playwright.config.js) starts a dedicated Vite server at `127.0.0.1:4179` and runs Chromium with one worker. The release and recording configurations preview the production build at `127.0.0.1:4180`. Both use synthetic data. GitHub video recording is opt-in. See the [test runbook](tests/README.md) for prerequisites and commands.

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
| P1-01 | SEC-02, SEC-05 · Organizer and volunteer email, sign-in redirects, and request limits. | Handler and database integration · `tests/edge/email-auth.test.ts`, `tests/edge/relay-authorization.test.ts`, `tests/database/auth-mail-rate-limit.sql`, `tests/database/volunteer-mail-notifications.sql` | Stubbed identity and mail transport, synthetic signup and waiver records. | Staff mail requires a verified role. Volunteer notices resolve recipients from owned activity and avoid repeats. Sign-in mail enforces the approved redirect and request limits. | Passed offline. Hosted rollout remains to be verified. |
| P1-02 | SEC-03, SEC-04 · Profile, emergency-contact, and directory reads by role. | Database and browser integration · `tests/database/profile-access.sql`, `tests/database/emergency-contact-access.sql`, `tests/organizer/assignment.spec.js` | Synthetic accounts, roles, assignments, and contact details. | Volunteers can see and edit their own emergency contact. Admins and leaders can read emergency contacts through the authorized operation. Other volunteers and anonymous users cannot read them. Staff browser workflows keep working. | Passed offline. Hosted verification pending. |
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

Role signups use event-day age when the role has a date. The standalone form asks age at signing, and the database uses the signing date for undated roles. A parent or legal guardian signs for minors. The signed-in role form and the standalone waiver collect that consent:

- **Role page, signed in:** [Signup.svelte](src/routes/volunteer/Signup.svelte) at `/#/signup/:id` sends consent to `confirm_volunteer_signup`.
- **Standalone waiver:** [SignWaiver.svelte](src/routes/volunteer/SignWaiver.svelte) at `/#/volunteer/waiver`, used by volunteers that an organizer or leader added. It calls `sign_volunteer_waiver` through [waiver.js](src/lib/stores/waiver.js).

Guests start on the role page or in the [Browse Roles dialog](src/routes/volunteer/BrowseRoles.svelte). Both use [createVolunteerAccount](src/lib/volunteerSignup.js) and reach the same signed-in role form after authentication.

Guardian data is stored in the `waivers` columns that [20260125000000_add_waiver_parent_columns.sql](supabase/migrations/20260125000000_add_waiver_parent_columns.sql) adds. The [shared waiver migration](supabase/migrations/20261118000300_enforce_shared_volunteer_waiver_policy.sql) applies the same validation to both signing operations. Waivers without an age declaration are retained as history and must be re-collected when a current waiver is needed. The kids' clinic flow (P0-04, P1-06) is a different feature and is outside this section.

Use the P0 browser fixtures and the P1 disposable PostgreSQL harness with synthetic minors and guardians, such as `guardian@example.invalid`. Assert email requests at the intercepted `send-email` boundary. Do not use real names or addresses.

| ID | Behavior | Type and proposed file | Mocks or fixtures | Pass criteria | Status |
| --- | --- | --- | --- | --- | --- |
| MG-01 | Under-18 toggle and client validation on the role form and standalone waiver. | E2E · `tests/volunteer/minor-consent.spec.js` | Waiver settings, role, and session fixtures. | Declaring minor status shows the guardian section. Submit stays disabled, and no request is sent, until guardian name, email, and signature are present; whitespace counts as missing. Phone stays optional. Adults still need their own signature. If the box is checked, filled in, then unchecked, no guardian fields are sent. | Passed. Both forms and adult reset covered. |
| MG-02 | Signed-in role signup by a minor. | E2E · `tests/volunteer/minor-consent.spec.js` | `confirm_volunteer_signup` RPC and `send-email` interception. | The RPC receives `is_minor: true`, guardian fields, and the current waiver version. MG-07 verifies trimming when stored. When `created` is true, the page sends one volunteer email and one guardian email that names the role and date. When `created` is false, it sends neither email. A rejected RPC shows the error and sends no email. | Passed. Submission and notification behavior covered. PostgreSQL trims stored guardian fields in MG-07. |
| MG-03 | Signed-in minor assent, blank or explicitly provided. | E2E and database · `tests/volunteer/minor-consent.spec.js`, `tests/database/migrations.spec.js` | Same as MG-02, plus the real RPC on disposable PostgreSQL. | Complete guardian consent confirms signup with or without assent. The database stores absent assent as null and stores explicit assent separately from the guardian signature. An adult still needs a signature. | Passed offline. [#39](https://github.com/paulhainsworth/volunteer/issues/39) |
| MG-04 | Guest and details-modal signup by a minor with an immediate session. | E2E · `tests/volunteer/minor-consent.spec.js` | Auth `signUp` that returns a session, RPC, and `send-email`. | An immediate session opens the signed-in role form. After complete consent, the RPC receives the guardian fields with blank volunteer assent, confirms the seat, and triggers one guardian email. | Passed for both guest entry points. |
| MG-05 | Guest signup by a minor when email verification is pending. | E2E · `tests/volunteer/minor-consent.spec.js` | Auth `signUp` without a session, then a verification callback. | Both guest entry points collect account details first. Before verification, no seat, waiver, or guardian email is created. The redirect carries only the role ID. After returning to the role, the guest declares age and the guardian signs once. Incomplete guardian consent blocks confirmation. | Passed offline on the role page at 1366 × 768 and the Browse Roles dialog at 390 × 844. [#62](https://github.com/paulhainsworth/volunteer/issues/62) |
| MG-06 | Standalone waiver page for a minor. | E2E · `tests/volunteer/minor-consent.spec.js` | Waiver settings, signing RPC, and email. | Current version, declared minor status, optional assent, and guardian details are submitted. Success sends one guardian email and returns to the requested page. A rejected save shows the error, sends no email, and stays on the page. | Passed offline. |
| MG-07 | `confirm_volunteer_signup` enforces guardian consent. | Database · `tests/database/migrations.spec.js` | Synthetic volunteer, role, and waiver settings. | With `is_minor` true, a missing or whitespace-only guardian name, email, or signature raises "Parent or guardian consent is required". It writes no waiver and no seat. Complete consent stores trimmed values, stores a blank phone as null, and sets `parent_signed_at`. Adult consent leaves the guardian columns null. A repeat call after confirmation returns `created: false` and adds no second waiver. | Passed. Verified required guardian fields, rollback, stored values, and retries. |
| MG-08 | Shared age declaration and standalone guardian rules. | E2E and database · `tests/volunteer/minor-consent.spec.js`, `tests/database/migrations.spec.js` | Synthetic accounts, a dated role, and current and legacy waivers. | Complete adult or minor consent satisfies the waiver check and can be reused for an eligible role. An undeclared age or incomplete guardian consent is rejected. A legacy waiver prompts re-signing and stays in history. | Passed offline. [#42](https://github.com/paulhainsworth/volunteer/issues/42) |
| MG-09 | Guardian email content and failure handling. | E2E and handler · `tests/volunteer/minor-consent.spec.js`, `tests/edge/relay-authorization.test.ts`, `tests/edge/notifications.test.ts` | Synthetic notices, escaped display names, and intercepted provider errors. | Notifications use trusted stored activity and server-owned templates. HTML is escaped and provider diagnostics stay out of responses and logs. A delivery failure does not reverse a confirmed signup. | Passed offline. [#40](https://github.com/paulhainsworth/volunteer/issues/40), [#41](https://github.com/paulhainsworth/volunteer/issues/41) |

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

## Recorded role review

Run `npm run test:roles` to record the browser suite against the production bundle. The recorded suite uses the [synthetic backend fixture](tests/helpers/browser.js) and blocks unexpected external requests. Review the HTML report and WebM files under `artifacts/role-review/`. Use [the recording runbook](tests/README.md#record-a-role-review) to upload a replayable report to GitHub. Run the database and handler checks separately with `npm test`.

| Role | Feature | Automated browser evidence | Additional coverage needed |
| --- | --- | --- | --- |
| Volunteer and public visitor | Magic-link request, role navigation, sign-out, onboarding, and profile edits and reload | [Login](tests/auth/login.spec.js), [session and onboarding](tests/integration/full-auth-flow.spec.js), [profile and invite](tests/roles/volunteer.spec.js) | Hosted link delivery and changing an account email |
| Volunteer and public visitor | Browse opportunities with labeled filters, retain filter selections when closing the phone panel, view fill counts, accept team invites, sign up, and cancel assignments | [Browse](tests/volunteer/browse-roles.spec.js), [signup and cancellation](tests/volunteer/signup.spec.js), [team invite](tests/roles/volunteer.spec.js) | Native sharing and physical-device checks |
| Volunteer and public visitor | Adult and minor waivers, guardian delivery requests, kids’ clinic and registration errors | [Minor consent](tests/volunteer/minor-consent.spec.js), [kids’ clinic](tests/volunteer/kids-clinic.spec.js) | Hosted email delivery and waiver content approved by the event owner |
| Volunteer leader | Assigned roster, contact suggestions during assignment, additions, reactivation, rejected writes, duplicate submission, emergency details, editing, and removal | [Assignments](tests/organizer/assignment.spec.js), [leader review](tests/roles/leader.spec.js) | Hosted permission checks with assigned and unassigned test accounts |
| Volunteer leader | Share an invite, email assigned volunteers, and add or remove roles from their domain | [Leader review](tests/roles/leader.spec.js) | Native sharing and mail delivery in a separate approved environment |
| Administrator | Dashboard, role create/edit/duplicate/delete, CSV template/import/export, featured and critical role flags | [Admin review](tests/roles/admin.spec.js) | CSV bulk import with mixed success and deleting a role with signups |
| Administrator | Create, edit, and delete domains; assign an existing leader to a domain; promote a volunteer to leader; add and cancel a roster assignment for an existing volunteer; create a volunteer and assign a shift | [Admin review](tests/roles/admin.spec.js), [assignments](tests/organizer/assignment.spec.js) | Create a new account inline while assigning a domain, and change user details |
| Administrator | Send email after session refresh, select recipients by role, schedule, or unsigned waiver, toggle daily summaries, manage NICA coaches, copy a NICA summary, and export a NICA roster | [Admin review](tests/roles/admin.spec.js), [PDF export](tests/organizer/pdf-export.spec.js) | Live provider delivery, delivery diagnostics, and hosted scheduler delivery |
| Administrator and volunteer leader | Search the event directory during its enabled window; expiry redirect | [Directory review](tests/roles/volunteer.spec.js), [database access matrix](tests/database/migrations.spec.js) | Hosted access matrix |
| Public visitor | Homepage shift discovery and open spot counts, mobile menu dismissal with keyboard focus restoration, and board biographies | [Homepage review](tests/volunteer/browse-roles.spec.js), [mobile navigation and board review](tests/roles/volunteer.spec.js) | Static navigation destinations and physical-device checks |

When adding, removing, or changing a feature, update its entry here and its tests in the same PR. Record the affected roles, the scenario and its pass criteria, the test file, any fixture changes, and any remaining gaps. Run the affected cases, then run `npm run test:roles` for a full browser review. Save the GitHub artifact link with the tested commit when a recording is needed for review.

### Regression checks from the recorded role review

Run `npm run test:roles -- tests/roles/volunteer.spec.js tests/roles/admin.spec.js` for these checks with synthetic profiles, Auth tokens, signup records, and relay responses.

- A signed-in reload restores the profile form and stays on its route. A signed-out visit redirects to sign-in without reading a profile. [Profile.svelte](src/routes/Profile.svelte)
- Auth refresh releases the client before profile hydration. The admin form sends one relay request and reports success after the mocked refresh. [Auth store](src/lib/stores/auth.js), [Communications.svelte](src/routes/admin/Communications.svelte)
- Role and schedule filters use confirmed signup records. A role excludes cancelled assignments, a date counts volunteers once across shifts, and a completion month includes its assigned volunteers. [Communications.svelte](src/routes/admin/Communications.svelte)
