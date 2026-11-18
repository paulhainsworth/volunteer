# Features

The Berkeley Bicycle Club volunteer hub helps race organizers staff events, track signups, and collect waivers. It also handles kids’ clinic registration and NICA coach coordination.

| Area | What the app supports | What the test suite checks |
| --- | --- | --- |
| Sign-in and onboarding | Request a magic link, sign in as a volunteer, leader, or admin, and provide an emergency contact on first login. | Email validation, request success and failure, role-specific navigation, emergency-contact setup, and sign-out. |
| Volunteer opportunities | Browse and filter roles, see open spots, sign up, and cancel assignments. | Role counts, empty and failed reads, signup with or without an active session, existing assignments, and cancellation. |
| Waivers and clinic registration | Collect consent for volunteer signups and kids’ clinic registration. | Consent gating, rejected writes, and confirmation status when email delivery fails. |
| Organizer tools | Assign volunteers to roles, view a leader’s roster, and export NICA team rosters as PDFs. | Organizer assignment, leader roster visibility, and a real PDF download with fixture data. |
| Database setup and notifications | Apply schema migrations and send confirmations and scheduled summaries. | Migration and cleanup behavior in disposable PostgreSQL, selected Edge Function behavior, and the daily-summary opt-out. |

Run the suite with `npm test` after following the [test setup](tests/README.md). The local baseline recorded **30 passes, 5 expected failures, and 0 unexpected failures**. The expected failures track reload on My Signups, a missing migration prerequisite, signup reactivation, guardian-waiver persistence, and duplicate clinic registration.

See the [test plan](TEST_PLAN.md) for coverage gaps and [audit](AUDIT.md) for prioritized fixes.
