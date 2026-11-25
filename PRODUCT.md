# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a person claiming a volunteer shift for the Berkeley Omnium. They arrive to find a shift that fits their schedule, sign up, and complete the waiver the seat requires. They may be new to the club and may be under 18.

Volunteer leaders staff the domains they are assigned and use the contact directory, shift rosters, and shareable invites. Administrators staff the event: shifts, capacity, season rollover, communications, and published site copy. A parent or guardian signs once for a minor before that seat is confirmed. A parent also registers a child for the kids' clinic. These are confirmed secondary audiences. Future design work treats the volunteer claiming a shift as primary.

## Product Purpose

Berkeley Bicycle Club uses this hub to staff the Berkeley Omnium. The public job is to turn an open shift into a confirmed signup with the required waiver. Organizer tools exist so the club can see what is filled, what is critical, and who is coming back next season.

Success is a volunteer who found a fitting shift and holds a confirmed seat, and a club that can see remaining gaps before race weekend. No numeric success target is recorded.

## Positioning

This is the Berkeley Bicycle Club's volunteer hub for the Berkeley Omnium, not a reusable volunteer product. A neighboring signup tool could not truthfully claim this coupling: Omnium shifts whose proceeds support named East Bay youth cycling teams, a kids' clinic registration with its own waiver, NICA coach and team-roster exports, and public copy the club publishes from inside the app.

The confirmed boundary is this club and this event. Adapting the repository for another organization is outside the product.

## Operating Context

People use it in a browser, including on a phone while choosing a shift. Guests browse the homepage and a shift, then authenticate with an email magic link. The first signed-in session asks for an emergency contact. After that, the app sends volunteers to their shifts, leaders to their dashboard, and administrators to the organizer dashboard.

Race staffing happens across a season. Dated shifts, waivers, and assignments carry over a rollover. Prior-year shifts archive. Returning volunteers reappear when they take an active signup. Leaders share a domain invite link. Administrators publish the event year, the critical-shift banner, the homepage thank-you, and the new-volunteer welcome. The year can be inserted into those messages with `{year}`.

The kids' clinic is a separate public registration at `/kids`. The board page introduces club people. The contact directory is limited to administrators and volunteer leaders.

## Capabilities and Constraints

Confirmed:

- Public shift discovery, search, and filters, including a phone layout that keeps search and availability visible.
- Guest signup, magic-link sign-in, and sign-out. Roles are `volunteer`, `volunteer_leader`, and `admin`.
- One emergency contact, readable by the volunteer and by administrators and volunteer leaders in staff workflows.
- Waiver gating. Volunteers declare age. A minor needs a guardian signature before the seat is confirmed. Waivers collected before age declarations require renewal. Administrators can email a reminder to everyone with a confirmed signup who still needs the current waiver, or to one person.
- Cancellation of a volunteer's own assignment.
- Leader domains, domain invites, shift rosters, and emergency-contact visibility for assigned domains.
- Administrator shift management, critical spots, volunteer history, season rollover, CSV roster export, and NICA team roster PDFs.
- Kids' clinic registration with the clinic waiver, with a visible warning when the confirmation email does not send.
- Website messages as the source of published public copy named above.
- Theme choice stored in the browser. Dark is the default.

Constraints:

- The browser talks to the configured Supabase project with the public anon key. Row Level Security is the access boundary. Service-role credentials stay on the server.
- The app is a Svelte single-page app. Routes live in the URL hash.
- Do not invent another club, another event, or a generic product shell.
- Passkey sign-in is not a capability. Nothing in the app reads passkey or WebAuthn settings.
- Calendar export is described in `README.md` and was not found as a shipped flow. Do not treat it as a capability.
- These are listed as future ideas in `README.md` and are not current product: SMS, QR check-in, volunteer-hour tracking, multi-event management, preference and availability profiles, shift trading, event templates, and bulk role creation from CSV.

## Brand Commitments

The product name is Berkeley Omnium Volunteer Hub. It belongs to the Berkeley Bicycle Club and the Berkeley Omnium, a two-day race weekend of the Berkeley Hills Road Race and the Berkeley Streets Criterium. Public copy states that the event supports East Bay youth cycling, including the NICA teams linked from the homepage. The club publishes homepage and welcome copy through website messages. No visual system, palette, or type commitment is recorded here.

## Evidence on Hand

- Public name and description: `index.html`.
- Homepage job, Omnium description, and 2026 NICA team links: `src/routes/Home.svelte`.
- Feature inventory matched to the test suite: `features.md`.
- Routes: `src/App.svelte`.
- Named board biographies: `src/routes/Board.svelte`.
- Kids' clinic waiver text: `src/lib/data/kidsClinicUsacWaiver.js`.
- Administrator promotion procedure: `docs/admin-access.md`.
- Local demo accounts and a fictional 2026 Omnium seed: `docs/local-development.md` and `supabase/demo/omnium-2026.sql`. Those records are synthetic. Do not present them as real volunteers, real assignments, or testimonials.
- No customer quotes, press clippings, pricing, or usage metrics are in the repository. Do not fabricate them.

## Product Principles

- Design the public path for someone choosing and claiming a shift.
- Keep the product specific to the Berkeley Bicycle Club and the Berkeley Omnium.
- A seat is confirmed only when the waiver the shift requires is complete, including guardian consent for a minor.
- Public event copy comes from the messages the club publishes, not from a redesign invented beside them.
- Organizer tools serve staffing. They do not replace the volunteer's job as the primary surface.

## Accessibility & Inclusion

Minors cannot confirm a seat on their own. A parent or guardian signs for them. The first session collects an emergency contact before the rest of the app. The interface can be switched between dark and light, and the choice is remembered in that browser. No separate accessibility standard has been adopted.
