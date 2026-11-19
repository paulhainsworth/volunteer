# Features

The Berkeley Bicycle Club volunteer hub helps race organizers staff events, track signups, and collect waivers. It also handles kids’ clinic registration and NICA coach coordination.

| Area | What the app supports | What the test suite checks |
| --- | --- | --- |
| Sign-in and onboarding | Request a magic link, sign in as a volunteer, leader, or admin, and provide an emergency contact on first login. | Email validation, request success and failure, role-specific navigation, emergency-contact setup, and sign-out. |
| Volunteer opportunities | Browse and filter roles, see open spots, sign up after authentication, and cancel assignments. Guests declare their age and sign the waiver after authentication. A parent or guardian signs once for a minor before the seat is confirmed. | Role counts, empty and failed reads, signup with or without an active session, existing assignments, and cancellation. |
| Waivers and clinic registration | Collect consent for volunteer signups and kids’ clinic registration. Volunteer waivers require an age declaration and guardian consent for minors. Waivers collected before age declarations require renewal. | Consent gating, concurrent seat allocation, rollback on rejected writes, clinic retry deduplication, and delivery status when email fails. |
| Organizer tools | Assign volunteers to roles, view a leader’s roster, and export NICA team rosters as PDFs. | Organizer assignment, leader roster visibility, and a real PDF download with fixture data. |
| Database setup and notifications | Apply schema migrations and send confirmations and scheduled summaries. | Migration and cleanup behavior in disposable PostgreSQL, selected Edge Function behavior, and the daily-summary opt-out. |

Run the suite with `npm test` after following the [test setup](tests/README.md).

See the [test plan](TEST_PLAN.md) for coverage gaps and [audit](AUDIT.md) for prioritized fixes.

The volunteer contact directory is available to administrators and volunteer leaders.

Volunteers can read and edit their own emergency-contact details. Admins and all volunteer leaders can read emergency-contact details through authorized staff workflows.
