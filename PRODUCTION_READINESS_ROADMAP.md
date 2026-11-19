# Volunteer production readiness roadmap

Updated November 18, 2026. This is the delivery sequence for the Berkeley Bicycle Club volunteer hub. The [codebase map](CODEBASE_MAP.md) describes the architecture, the [audit](AUDIT.md) records the evidence, and the [test plan](TEST_PLAN.md) tracks verification. Use [PRODUCTION_PRIORITIES.md](PRODUCTION_PRIORITIES.md) for the original organizer workflow requirements.

## Current baseline

| Flow | What is in the repository | Evidence and limits |
| --- | --- | --- |
| Prepare roles and rosters | Admin role CRUD, duplication, bulk CSV upload, and volunteer assignment. | [RolesList.svelte](src/routes/admin/RolesList.svelte), [BulkUpload.svelte](src/lib/components/BulkUpload.svelte), [assignment tests](tests/organizer/assignment.spec.js). The full event CSV rehearsal is still open. |
| Browse and sign up | Homepage shift discovery, public role browsing with compact filters on phones, guest and signed-in signup, waiver collection, My Signups, and cancellation. | [Volunteer routes](src/routes/volunteer/), [browse tests](tests/volunteer/browse-roles.spec.js). Signup, waiver integrity, and retries passed offline in [PR #28](https://github.com/paulhainsworth/volunteer/pull/28). Rehearse shared adult and minor waiver validation and legacy renewal before promotion. Hosted verification remains open. |
| Sign in and onboard | Magic-link login, role-specific navigation, and emergency-contact onboarding. | [Login](src/routes/auth/Login.svelte), [auth integration tests](tests/integration/full-auth-flow.spec.js). The reload fix passed offline and merged in [PR #25](https://github.com/paulhainsworth/volunteer/pull/25). Production delivery is unverified. |
| Delegate and communicate | Domain management, leader dashboard, organizer email, and scheduled summaries. | [Domains](src/routes/admin/Domains.svelte), [leader dashboard](src/routes/leader/Dashboard.svelte), [Communications](src/routes/admin/Communications.svelte), [digest workflow](.github/workflows/nica-coach-digest-cron.yml). Sender ownership and live scheduler behavior need verification. |
| Run clinic and NICA workflows | Kids’ clinic registration and consent, NICA roster PDF export, and coach digest code. | [KidsClinic.svelte](src/routes/KidsClinic.svelte), [PDF export test](tests/organizer/pdf-export.spec.js), [NICA digest function](supabase/functions/send-nica-coach-digest/index.ts). Clinic retry deduplication passed offline in [PR #28](https://github.com/paulhainsworth/volunteer/pull/28). |

As of this review, the offline suite and audit links are merged. The login and signup fixes are merged and verified offline. Automatic GitHub tests were removed. Run the suite locally before a release. Live Supabase policies, migration history, and provider delivery are unverified. [Test baseline](https://github.com/paulhainsworth/volunteer/pull/4) · [Audit links](https://github.com/paulhainsworth/volunteer/pull/24) · [Login PR](https://github.com/paulhainsworth/volunteer/pull/25)

## Phase 1 · Restore the release checks and contain access risk

| Order | Deliverable | Complete when | Tracking |
| --- | --- | --- | --- |
| 1 | Maintain local release checks | Run the local suite and production build. Close the remaining permission and preview coverage gaps. | [#7](https://github.com/paulhainsworth/volunteer/issues/7), [#11](https://github.com/paulhainsworth/volunteer/issues/11), [PR #25](https://github.com/paulhainsworth/volunteer/pull/25) |
| Parallel | Confirm profile and directory access and administrator provisioning | An environment owner verifies effective access. Offline tests cover the approved audience, emergency-contact fields, and role changes. Hosted grants and the staged emergency-contact rollout still need verification. Administrator setup uses individual invitations. | [#16](https://github.com/paulhainsworth/volunteer/issues/16), [#18](https://github.com/paulhainsworth/volunteer/issues/18), [#19](https://github.com/paulhainsworth/volunteer/issues/19) |
| Parallel | Restrict outbound email and finish magic-link safeguards | Organizer and public workflows have explicit permission and redirect rules, rate limits, and passing tests with fake delivery. | [#17](https://github.com/paulhainsworth/volunteer/issues/17), [#20](https://github.com/paulhainsworth/volunteer/issues/20) |

## Phase 2 · Protect signup and make deployment reproducible

| Order | Deliverable | Complete when | Tracking |
| --- | --- | --- | --- |
| 1 | Verify the hosted database baseline | The disposable upgrade and legacy data preservation are verified. Run the hosted baseline report and follow the staged [security rollout checkpoints](docs/operations.md#security-rollout-checkpoints). | [#6](https://github.com/paulhainsworth/volunteer/issues/6), [#8](https://github.com/paulhainsworth/volunteer/issues/8) |
| 2 | Make volunteer signup consistent | Signup is bound to verified identity. A last-seat race yields at most one confirmed assignment, and failed consent or assignment writes produce an accurate outcome. Retries avoid duplicates. | [#5](https://github.com/paulhainsworth/volunteer/issues/5), [#21](https://github.com/paulhainsworth/volunteer/issues/21) |
| 3 | Make clinic registration safe to retry | Repeated submission keeps one registration, request limits are tested, and mail failure reports whether the registration was saved. | [#23](https://github.com/paulhainsworth/volunteer/issues/23) |
| Parallel | Triage dependency advisories | Prioritize findings by actual reachability. Compatible upgrades pass the full offline suite, browser PDF export, and production build. | [#22](https://github.com/paulhainsworth/volunteer/issues/22) |

## Phase 3 · Rehearse race-day operations

| Deliverable | Complete when | Tracking |
| --- | --- | --- |
| Delivery and monitoring | Each event has one intended notification path. A designated owner can see failed delivery and missed digests. | [#9](https://github.com/paulhainsworth/volunteer/issues/9), [#13](https://github.com/paulhainsworth/volunteer/issues/13) |
| Data cleanup | Operators can verify the target, preview the affected rows, and rehearse recovery on disposable data. | [#12](https://github.com/paulhainsworth/volunteer/issues/12) |
| Event rehearsal | On an approved test environment, an organizer imports a representative CSV, checks public roles and counts, assigns a leader, and sends to test recipients. A volunteer signs in, signs a waiver, signs up, reloads, and cancels. A clinic registration and NICA export complete with fixture data. | [Original organizer requirements](PRODUCTION_PRIORITIES.md), [test plan](TEST_PLAN.md) |

Before promotion, record the Vercel and Supabase targets, verify migration and function versions, confirm the intended access and scheduler settings, run the build and key-route smoke checks, and document rollback. The [test plan](TEST_PLAN.md) lists remaining pure-logic and build smoke coverage.

## Phase 4 · Reduce maintenance cost

Remove starter scaffolding and stale test output. Confirm the supported auth routes before removing legacy components. Consolidate roster write logic after leader assignments, organizer permissions, failure handling, and notifications have regression coverage. Keep UI polish, accessibility, and performance work tied to findings from the event rehearsal. [#10](https://github.com/paulhainsworth/volunteer/issues/10) · [#14](https://github.com/paulhainsworth/volunteer/issues/14) · [#15](https://github.com/paulhainsworth/volunteer/issues/15)

Keep event templates, expanded reporting and reminders, multi-event management, QR check-in, volunteer preferences, shift swaps, SMS, and hours tracking in the feature backlog until organizers confirm their priority.
