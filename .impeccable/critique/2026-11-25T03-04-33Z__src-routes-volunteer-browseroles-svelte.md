---
target: src/routes/volunteer/BrowseRoles.svelte
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/routes/volunteer/BrowseRoles.svelte"
target_fingerprint: "sha256:c8f8e8de56bb667e8f973e376e89f9accf1f6c1fa56cf4038ca22f2996b58bc7"
target_path: src/routes/volunteer/BrowseRoles.svelte
timestamp: 2026-11-25T03-04-33Z
slug: src-routes-volunteer-browseroles-svelte
---
Method: dual-agent (A: 01a210a2-27b2-7981-9d54-381e6fd27c11 · B: 01a210a2-27b2-7981-9d54-382061412dcf)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Open-spot total, fill badges, and critical lines are clear. Sort does not move the guest board, and Urgent need still matched 234 of 248 spots. |
| 2 | Match System / Real World | 2 | Homepage and the published intro say shifts. This page says opportunities and roles. BHRR and BSC are never expanded. |
| 3 | User Control and Freedom | 3 | Race-day and duration filters work. Cancel, overlay click, and Escape close the modals. The empty state has no reset, and Sort looks live while doing nothing. |
| 4 | Consistency and Standards | 2 | Two blues, two close glyphs, Share and Copy both copying a `#/signup/{id}` link, and radii off the 4/6/12 scale. |
| 5 | Error Prevention | 2 | Emergency contact is starred and not checked on submit. Nothing on the form says Continue to Waiver does not hold the seat. |
| 6 | Recognition Rather Than Recall | 2 | Critical cards show day, time, and place. The other 19 teams show a name, a leader, and an open count. |
| 7 | Flexibility and Efficiency | 3 | Search plus race day and duration are real tools. Guest Sort is a dead control. |
| 8 | Aesthetic and Minimalist Design | 2 | Duplicate duration, duplicate critical warnings, emoji, and a resting shadow on team rows. |
| 9 | Error Recovery | 2 | Empty copy is one sentence and offers no way back. |
| 10 | Help and Documentation | 2 | The marshal description explains the work. Waiver, under 18, and emergency contact are not explained when the person signs up. |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Content-specific, chrome interchangeable. The data is this club: Berkeley Omnium thank-you, BHRR and BSC, Orinda BART, course-marshal work. The frame is a stock dark catalog: "Volunteer Opportunities," "role," emoji meta rows, pill badges, accordion teams, and Action Blue `#007bff` beside Shift Blue `#4d9fff`. It does not yet read as The Shift Board.

**Deterministic scan.** `impeccable detect` on `src/routes/volunteer/BrowseRoles.svelte` exited 0 and printed 32 advisory findings: `design-system-font-size` 22, `design-system-radius` 8 (10px, 8px, 999px, 20px, 16px), `design-system-color` 2 (`rgba(0,0,0,0.1)` hover shadow, `rgba(0,0,0,0.5)` overlay). The two rgba hits are a neutral scrim and shadow, not a new brand color. The 8px radii are real deviations. The accepted set was not flagged: system sans, 6px radius, dark default, Shift Blue via CSS variables.

**Visual overlays.** Headless Playwright confirmed mutable injection. `impeccable live-server` on port 8400 injected `detect.js`. Console: `[impeccable] 10 anti-patterns found`. `low-contrast` 2.7:1 white `#ffffff` on `#4d9fff` (1). `low-contrast` 4.0:1 white on `#007bff` (8). `skipped-heading`: h1 "Volunteer Opportunities" then h3 "BHRR Course Marshal" before any h2. No user-visible overlay. Chrome DevTools stayed locked to its existing profile, so the `[Human]` tab was not opened. The live server on port 8400 was stopped after the console read. Vite on port 5180 served the page for this review.

## Overall Impression

The guest board is a real Omnium roster in a generic opportunities frame. Critical shifts lead, with day, time, and place on those cards. The rest of the catalog hides the schedule, and the signup form never says the seat is not held yet.

## What's Working

- Critical shifts lead, with the club's own line: "Please consider taking one of the remaining critical shifts." Date, time, place, and fill are on those cards.
- Event day splits the catalog: 248 open spots, BHRR 108, BSC 98, pre-race 42, post-race 13. On a 390px screen the extra filters sit behind one Filters control.
- `#/volunteer?info={id}` opened the matching shift. Info holds the real job description.

## Priority Issues

**[P1] The catalog hides the schedule.**
Collapsed teams have no day or time. Cards omit the year (`Sat, Apr 18`). "Race day: BHRR" and "BSC" are insider labels. A person scanning for Saturday road race versus Sunday criterium has to open teams one by one.
**Why it matters:** The homepage now promises a shift they can see. Nineteen of the twenty-seven groups on this page do not say when the work happens.
**Fix:** Put the day on the team row. Spell Hills Road Race and Streets Criterium in the event-day filter. Keep one duration line on the card.
**Suggested command:** $impeccable clarify

**[P1] The signup form does not say what is true.**
The live modal says "Enter your information to continue to the waiver." It never says the seat is unconfirmed, never asks age, and never says a guardian signs for someone under 18. Emergency Contact Name and Phone are labeled `*` and `submitPiiModal` does not check them. Required checks are first name, last name, email, and affiliation.
**Why it matters:** Continue to Waiver reads like a held seat. A parent can type a child's name with no warning.
**Fix:** Say it above the fields: waiver is next, the emergency contact is for race day, under 18 needs a guardian before the seat is confirmed, and nothing is held yet. Drop the asterisks on fields the submit does not require, or require them.
**Suggested command:** $impeccable clarify

**[P1] Info and signup are not dialogs.**
Opening Info left focus on the button behind the overlay. The modal root has no `role="dialog"`, no `aria-modal`, and no name. Team rows are `role="button"` and only Enter toggles them. Space left them collapsed. Critical cards are `h3` immediately after the page `h1`. The "Browse by team" `h2` comes later. Emoji for date, time, place, and people sit in the accessible name.
**Why it matters:** Keyboard and screen-reader users are not in the dialog they just opened, and the outline skips a level.
**Fix:** Move focus into a named dialog, restore it on close, toggle teams with Space, set `aria-expanded`, and make the card title an `h2` or group the critical cards under a heading.
**Suggested command:** $impeccable harden

**[P2] Sort and Urgent need do not do what they say.**
`filteredRoles` sorts by `sortBy`, then the guest view throws that order away. `topCriticalRoles` sorts by critical count. Domain groups sort by critical-then-name, and roles inside a domain sort by name (`compareRolesForDomain`). Urgent need keeps a role when it is under half full and `getApproxDaysUntilScheduleEnd` is not greater than 7. Past dates return a negative day count, so they pass. On 24 Nov 2026 that matched 234 of 248 open spots.
**Why it matters:** Two of the five desktop filters look live and barely change the board.
**Fix:** Apply `sortBy` to the list the guest actually sees, or remove Sort until it does. Define Urgent as the same critical-open rule the cards already use, and exclude shifts whose date has passed.
**Suggested command:** $impeccable clarify

**[P2] Primary actions use a second blue and fail contrast.**
Sign Up fill is `#007bff`. Detector: white on that fill is 4.0:1 (8 hits) and white on `#4d9fff` is 2.7:1 (1 hit). Both need 4.5:1. Sign Up and Info measured about 35px tall. The modal close control is 36px. Clock time and "Est." repeat the same duration on timed shifts.
**Why it matters:** The one-blue rule and the text-contrast floor both break on the button a person has to press.
**Fix:** One theme blue, a darker fill so white text clears 4.5:1, a 44px minimum on Sign Up, Info, and Close, and one duration line.
**Suggested command:** $impeccable polish

## Persona Red Flags

**Jordan (first-timer).** The title is "Volunteer Opportunities" and the subtitle says "role," while the note says "critical shifts." Nineteen teams give no time. "Race day: BHRR" assumes the acronym. "Led by asd asd" and "Volunteer Leader TBD" sit on the Info panel.

**Casey (phone, one thumb).** Sign Up and Info are about 35px tall. Close is 36px. First and last name sit side by side, and so do the emergency fields. The catalog is a long stack of lookalike rows. The useful filters are behind Filters, which is the right collapse, but the rows still do not say the day.

**Sam (keyboard and screen reader).** Space does not expand a team. The dialog does not take focus. Emoji are in the accessible name. The critical mark is announced as "Critical role" and again as "23 critical spots still needed." Sign Up contrast is about 4.0:1. The heading level jumps from h1 to h3.

**Morgan (parent of a minor).** Nothing in Info or the signup form says the seat is not confirmed until a guardian signs. The form collects a name, email, and emergency contact as if this person is the adult volunteer.

## Minor Observations

- Flexible shifts split duration correctly: "Flexible" plus "Est. 4h". Timed shifts say the hours twice.
- Share and Copy do the same job, and the link is `#/signup/{id}`, not `#/volunteer?info=`.
- Intro radius 10px, team rows 8px, modal 16px, badges 20px. The scale is 4, 6, and 12.
- The marshal description includes the typo "raceres." That is content.
- Empty search shows "No volunteer opportunities found matching your filters." and no reset.
- Loading was not reproduced. One console 404. No uncaught page error.

## Questions to Consider

- If the homepage asks people to find a shift, why does this board still ask them to find a role?
- What would a parent need to read before typing a child's name so Continue to Waiver cannot be mistaken for a held seat?
- Why are eight critical cards fully open while the other teams hide the day and the time?

## Cognitive load

Failures: single focus, chunking, hierarchy, one decision at a time, four-item limit, working memory. Grouping is partial. Progressive disclosure is the part that works: collapsed teams, extra filters on a phone, description inside Info.

Decision points over four items: the desktop filter row (search, availability, sort, event day, duration), eight critical cards with two actions each, nineteen team rows with no day, and seven fields on the signup form.

## What was on screen

Dark theme. Supabase returned 75 roles. The board showed 248 total open spots, 8 critical cards, and 19 collapsed teams. First cards included BHRR Course Marshal (Sat, Apr 18, 7:00 AM–2:00 PM, Orinda BART, 7/38, 23 critical). Info and the guest signup modal opened and were not submitted. Deep link `#/volunteer?info=1ebea46b-8caa-47f0-b1ac-271f13e740cf` opened Neighborhood meeting flyers.
