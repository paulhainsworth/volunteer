# Features

The Berkeley Bicycle Club volunteer hub helps race organizers staff events, track signups, and collect waivers. It also handles kids’ clinic registration and NICA coach coordination.

| Area | What the app supports | What the test suite checks |
| --- | --- | --- |
| Sign-in and onboarding | Request a magic link, sign in as a volunteer, leader, or admin, and provide an emergency contact on first login. | Email validation, request success and failure, role-specific navigation, emergency-contact setup, and sign-out. |
| Display preferences | Dark is the default. Switch to light mode from the navigation menu, and the app remembers the selection in this browser and applies it to other open tabs. Native controls, such as date pickers and scrollbars, follow the selected theme. | Theme changes on the header logo, sign-in form, volunteer role dialog, and admin dashboard, the `color-scheme` hint, and preference persistence on reload. |
| Dialogs and status messages | Dialogs open as native modals. They hold keyboard focus, close with Escape, and return focus to the control that opened them. Destructive actions ask for confirmation in the app, with Cancel focused first. Success and error messages appear in a Notifications region and are announced to screen readers. | Native modal behavior, Escape and focus return, confirm and cancel paths for deletes, and notification text after imports and account creation. |
| Assignment history | Admins can filter Users by a confirmed shift, including past assignments, view each user’s signup history, and export the matching shift roster. Table columns sort with a mouse or keyboard. | Same-named shifts across years, archived and returning volunteers, filtered CSV export, and keyboard column sorting. |
| Season rollover | Administrators preview and start a new roster year under Users. Prior dated shifts and volunteers with only past shifts are archived, and returning volunteers reappear after an active signup. Admin and leader assignments, signups, and waivers are preserved. | Preview, confirmation, public role access, active mailing lists, returning volunteers, and admin-only updates. |
| Website messages | Admins publish the event year, critical shift banner, homepage thank-you, and new volunteer welcome from Communications. The year can be reused in messages with `{year}`. | Admin publishing, public copy refresh, permissions, and preservation of the historical fundraising year. |
| Volunteer opportunities | Find shifts and open spots from the homepage, learn how the Omnium supports East Bay youth cycling and visit the six teams supported in 2026, search and filter roles, sign up, cancel assignments, and add a shift to a calendar app in Pacific time. On phones, search and availability stay visible and additional filters open on demand. Guests declare their age and sign the waiver after authentication. A parent or guardian signs once for a minor before the seat is confirmed. | Homepage shift counts and community impact links, labeled filters, mobile filter persistence and keyboard navigation, empty and failed reads, signup, cancellation, and a calendar file from a device outside Pacific time. |
| Waivers and clinic registration | Collect consent for volunteer signups and kids’ clinic registration. Volunteer waivers require an age declaration and guardian consent for minors. Waivers collected before age declarations require renewal. | Consent gating, concurrent seat allocation, rollback on rejected writes, clinic retry deduplication, and delivery status when email fails. |
| Organizer tools | Assign volunteers to roles, view a leader’s roster, and export NICA team rosters as PDFs. | Organizer assignment, leader roster visibility, and a real PDF download with fixture data. |
| Waiver reminders | In Admin → Communications, email all volunteers with confirmed signups who need the current waiver, or pick one. The reminder template links to the sign-in and waiver flow. | Bulk and individual delivery with mocked email and sign-in links. Current valid waivers and cancelled assignments are excluded. |
| Database setup and notifications | Apply schema migrations and send confirmations and scheduled summaries. | Migration and cleanup behavior in disposable PostgreSQL, selected Edge Function behavior, and the daily-summary opt-out. |

Run the suite with `npm test` after following the [test setup](tests/README.md).

See the [recorded role review](TEST_PLAN.md#recorded-role-review) for Playwright coverage and videos, the [test plan](TEST_PLAN.md) for coverage gaps and [audit](AUDIT.md) for prioritized fixes.

The volunteer contact directory is available to administrators and volunteer leaders.

Volunteers can read and edit their own emergency-contact details. Admins and all volunteer leaders can read emergency-contact details through authorized staff workflows.
