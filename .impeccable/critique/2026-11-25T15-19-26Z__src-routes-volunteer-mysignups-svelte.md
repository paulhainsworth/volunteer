---
target: My Signups
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/routes/volunteer/MySignups.svelte"
target_fingerprint: "sha256:9cddaf09f12b2286d1fdb0a17b2dabb6ebba0ea8b605e84f45fe370f42e82d83"
target_path: src/routes/volunteer/MySignups.svelte
timestamp: 2026-11-25T15-19-26Z
slug: src-routes-volunteer-mysignups-svelte
---
Method: dual-agent (A: 01a2133b-f478-7ee2-8104-55d96e54f76e · B: parent scan after the detector agent stalled on Chrome)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Loading and "Cancelling..." exist. "Send Message" then alerts that Pat got a note that never left the browser. |
| 2 | Match System / Real World | 2 | The card says Course Marshal, Saturday, Spruce Street. The chrome says opportunities, Total Hours, and Completed. |
| 3 | User Control and Freedom | 2 | "No, Keep Signup" and Escape leave the confirm step. "Still Want to Cancel" closes both dialogs. |
| 4 | Consistency and Standards | 2 | Teal and Bootstrap red sit beside Action Blue. Radii are 8px, 16px, and 20px. |
| 5 | Error Prevention | 2 | Cancel repeats the shift and names who is told. The contact form invites a message it cannot send. |
| 6 | Recognition Rather Than Recall | 3 | Date, time, place, and Pat Leader's email and phone stay on the card and in the dialogs. |
| 7 | Flexibility and Efficiency of Use | 2 | Add to Calendar is a real shortcut. There is no faster path through cancel or contact. |
| 8 | Aesthetic and Minimalist Design | 2 | Two 2rem totals and a warning-colored leader card outweigh the shift name. |
| 9 | Error Recovery | 1 | A failed load prints `err.message` with no retry. Calendar trouble is a browser alert. |
| 10 | Help and Documentation | 2 | The cancel tips describe swapping shifts, which this hub does not do. |
| **Total** | | **20/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Interchangeable. The bar says Omnium Volunteer Hub. This view could be any volunteer tool: "My Volunteer Signups," "Manage your volunteer commitments," "Total Hours," "Browse Opportunities," and a calendar file whose product id is "Race Volunteer Manager." Berkeley Omnium shows up only inside the shift data.

**Deterministic scan:** `impeccable detect` on `src/routes/volunteer/MySignups.svelte` exited 2 with 36 findings. Two warnings are side-tab stripes (`border-left: 4px`) at lines 855 and 923. The other 34 are advisory: 13 font sizes off the DESIGN.md ramp, 13 colors outside the palette (`#17a2b8`, `#dc3545`, `#ffc107`, and scrims), and 8 radii off the 4/6/12 scale (8px, 16px, 20px). `#007bff` on the existing primary was not flagged. The scrim `rgba(0, 0, 0, 0.5)` is a functional overlay, not a slop color. The side-tabs and the teal and Bootstrap red match what the review found. The font-size list is drift, not the reason this page fails.

**Visual overlays:** No user-visible overlay. Chrome DevTools is locked. Headless Playwright could change the document, and `detect.js` was not injected.

## Overall Impression

The list itself is clear: upcoming Course Marshal, then past Registration. The trouble is everything wrapped around that list. A volunteer who just signed the waiver lands on an hours dashboard, a leader card painted as a warning, and a contact form that celebrates a send it did not do.

## What's Working

- The empty state is one heading, one sentence, and one way forward. Past rows drop Add to Calendar and Cancel Signup, so an old shift is not a second set of actions.
- Cancel repeats the shift, says the leader and coordinators will be notified, and puts "No, Keep Signup" above the destructive button. Escape closes either dialog.
- Date, time, duration, place, and the leader's email and phone are on the card. Headless Chromium at 1280 and 390 showed no horizontal overflow.

## Priority Issues

### [P1] Contact Leader announces a send that never happens

**Why it matters:** The note says "This will send an email to your volunteer leader." `handleSend` in `src/lib/components/ContactLeader.svelte` waits one second and alerts. The live check filled "Can I arrive early?" and got "Message sent to Pat Leader!" No mail request was made. A volunteer who needed Pat will stop trying.

**Fix:** Remove the form until a real send exists. Keep the mailto and tel links as the actions.

**Suggested command:** `$impeccable harden`

### [P1] "Still Want to Cancel" closes both dialogs

**Why it matters:** The button calls `closeContactLeaderModal()`, which sets `contactLeaderSignup` to null, then `showCancelConfirmation(contactLeaderSignup)`. The confirm panel renders only when `showCancelModal && cancellingSignup`. After the click, the page showed only "Upcoming (1)" and "Past (1)." The seat is still there, and the person who decided to cancel is back at the list with no dialog.

**Fix:** Keep the signup, close the contact panel, and open the confirm panel with that same signup.

**Suggested command:** `$impeccable harden`

### [P1] The panels are not dialogs

**Why it matters:** Both panels are clickable `div`s. Focus stays on the page underneath. The close control measured 36×36. The message field sets `outline: none` and a 3px ring at 10% Action Blue. Location and phone emoji are not `aria-hidden`; the date and time emoji are. A keyboard user can tab out of the confirm step into the card below it.

**Fix:** Use `role="dialog"` and `aria-modal`, move focus in, keep Tab inside, make the close control at least 44px, and use the 2px Shift Blue ring.

**Suggested command:** `$impeccable adapt`

### [P2] Contact and cancel use a second and third blue-red, and the leader is a warning

**Why it matters:** "Contact My Leader First" is `#17a2b8` with white text, about 3.0:1. In light theme the leader links are `#007bff` on `#fff3cd`, measured at 3.59:1. The card's Cancel Signup is a solid `#dc3545` at 4.53:1, from a later rule that overrides the outlined small button, so it no longer matches Add to Calendar. The no-leader branch shows `volunteer@mailinator.com`. The suggestion list offers swapping shifts.

**Fix:** Use the theme button styles. Put the leader on a neutral surface. Delete the swap list and the mailinator address.

**Suggested command:** `$impeccable colorize`

### [P2] The page reads as an hours record

**Why it matters:** With two shifts the header showed "2" and "4" beside "Total Signups" and "Total Hours." That sum is scheduled length. Hour tracking is not a capability of this hub, and a past row is badged "Completed" with no attendance. The empty link says "Browse Opportunities" while the nav says "Browse Roles."

**Fix:** Title the page as this volunteer's Omnium shifts. Point the empty state at finding a shift. Drop the totals, or label the number "Scheduled time." Badge past rows "Past."

**Suggested command:** `$impeccable distill`

## Persona Red Flags

**Jordan (first-timer):** "No signups yet" does not say whether the seat they just claimed is here. "Total Hours" sounds like a score. The tips say they can swap shifts. If they use the message box, the alert says Pat received it.

**Casey (phone):** The close control is 36×36. Add to Calendar and Cancel Signup are 52px tall in the card, then the confirm step stacks three full-width actions under a long leader panel. Below 1100px the theme switch is inside the closed menu. A tap on the dim overlay dismisses the confirm step. No horizontal overflow at 390.

**Sam (keyboard / screen reader):** Tab is not moved into the panel and is not trapped. Escape works through a window listener. The error line is not an alert. Loading is not a live region. After "Still Want to Cancel," the dialog and the focus both disappear with no status.

## Minor Observations

- `handleContactLeaderFirst` logs the signup, the role, and the leader's email and phone to the console.
- The card is flat at rest, which matches the board. The modal uses a 16px radius and a large shadow. The domain pill is 20px. The leader card is 8px.
- If `signup.phone` is set, it renders beside a phone emoji with no label, next to the leader's phone.
- The calendar file says `PRODID:-//Race Volunteer Manager//EN`.

## Questions to Consider

- If mailto and tel already reach Pat, what is the message box for?
- Should a past shift say Completed when the hub never records that the person showed up?
- Who is Total Hours for, when the number is only the length of the shifts on this page?
