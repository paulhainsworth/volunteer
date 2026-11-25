---
target: src/routes/volunteer/Signup.svelte
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/routes/volunteer/Signup.svelte"
target_fingerprint: "sha256:7446821f81ba55bffedeec056340beff1f3699b06264a17c7beaea82349fafa1"
target_path: src/routes/volunteer/Signup.svelte
timestamp: 2026-11-25T12-50-34Z
slug: src-routes-volunteer-signup-svelte
---
Method: dual-agent (A: 01a212b3-c48d-73f1-af42-96e2f10c9b94 · B: 01a212b3-c48d-73f1-af42-96fc784a0901)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Spots filled and loading are clear. "Continue to Waiver" is not the next state, and the error is not a live region. |
| 2 | Match System / Real World | 2 | The shift description talks like a race crew. The failure path still says "role" and "Opportunities." |
| 3 | User Control and Freedom | 2 | Sign in exists. The guest form has no Cancel. The signed-in form does. |
| 4 | Consistency and Standards | 1 | The board says shift, blocks a full shift, requires an emergency contact, and states the stakes. This page disagrees on all four. |
| 5 | Error Prevention | 1 | Empty name and email are caught. Emergency asterisks, the affiliation `required`, and a bad email are not. |
| 6 | Recognition Rather Than Recall | 2 | Date, time, and spots stay on the page. The waiver, the age rule, and "nothing is held" do not. |
| 7 | Flexibility and Efficiency | 2 | Tab order through the names works. The other path is a 17px "Log in." |
| 8 | Aesthetic and Minimalist Design | 2 | One dark column and one type family. A generic title and a repeated shift name waste the first screen. |
| 9 | Error Recovery | 2 | The empty-field message is plain and the form is kept. A bad link prints a database error. |
| 10 | Help and Documentation | 1 | The only line before submit says the waiver comes next. On this page, it does not. |
| **Total** | | **17/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment:** Split. The shift brief is this club: a Wednesday sweeping shift for the Hills Road Race, with corners, blowers, and brooms. The claim step around it is an interchangeable account form. It never says Omnium, never says the seat is not held, and never says why the emergency contact exists.

**Deterministic scan:** `impeccable detect` on `src/routes/volunteer/Signup.svelte` exited 0 and still listed 11 advisory hits: 3 colors (`rgba(0, 0, 0, 0.1)` twice, success green `#28a745` once), 4 radii (all `8px`), and 4 font sizes (`0.875rem`, `1.25rem`, `1.05rem`, `0.9rem`). Action Blue `#007bff` on the primary button was not flagged; it is already in DESIGN.md. The 8px radii and the resting shadow match leftovers already left alone on the board. `#28a745` on the success check is a real token miss (the success mark is `#48bb78`) and is not on the guest path.

**Visual overlays:** Mutation worked in the page (`document.title` and an appended script). The live detector script was not injected, because that assessment had no shell. No human-visible overlay was shown. Fallback is the headed-browser measurement below.

## Overall Impression

The shift itself is on the page. The claim is not. A guest is asked to continue to a waiver this screen cannot show, the emergency asterisks do not match the check, and a broken link answers in SQL.

## What's Working

- The brief is the actual crew. Sweeping, Wednesday, April 15, 2026, 4:00–7:00 PM (3 hours), 1 of 8 spots, location still to be set.
- Guest fields are labeled and 44px tall. At 390px the name row stacks and the page does not scroll sideways.
- Personal phone is marked "(optional)" in the label. Tab order through the names works, and the focused field shows a ring.

## Priority Issues

### [P1] The button describes a step this page cannot perform

- **Why it matters:** The subtitle says "Enter your information to continue to the waiver." The button says "Continue to Waiver." A guest's next state is an email link. The waiver markup, including the under-18 question, sits in the signed-in branch. `?demoWaiver=1` changes nothing for a guest. A minor, or a parent, will think the claim is finishing.
- **Fix:** Put the board's stakes under the shift name: the waiver comes next, nothing is held yet, a parent signs before the seat is confirmed, and the emergency contact is for race day. Label the button for the real action, which is emailing the link.
- **Suggested command:** `$impeccable clarify`

### [P1] Asterisks and the guest check disagree

- **Why it matters:** The labels mark emergency name and phone as required. `submitGuestSignup` does not read them, and the inputs are not `required`. The affiliation select is `required`, but the button is `type="button"`, so the browser never checks it. An empty click says only "First name, last name, and email are required." Filling those and leaving the club blank then says "Please select a team or club affiliation." A value of `not-an-email` is accepted as far as that check. The banner is not an alert, and on a phone it sits about a viewport above the thumb.
- **Fix:** Require the same emergency name and phone the board already requires, reject a bad email before the club question, and put the message on the first invalid field.
- **Suggested command:** `$impeccable harden`

### [P1] A bad link speaks SQL, and the page still says "role"

- **Why it matters:** `#/signup/not-a-role` renders "Error", the text `invalid input syntax for type uuid: "not-a-role"`, and "Back to Opportunities." The same vocabulary is in the full-shift warning, the email-check line ("return to this role"), and the success line ("this volunteer role"). The board already calls these shifts.
- **Fix:** Say "That link isn't a shift" and "Back to shifts." Map thrown messages instead of printing `err.message` for a bad id.
- **Suggested command:** `$impeccable clarify`

### [P2] The first screen on a phone is a title, not the form

- **Why it matters:** At 390px the h1 wraps to "Sign Up to / Volunteer," and the name fields start near y=984 in an 844px window. The h3 "Sign up for Sweeping" repeats the h2. Date and time sit in a row with a 100px label, so the values wrap mid-phrase.
- **Fix:** One heading, the shift name. Stack each fact's label above its value under 640px.
- **Suggested command:** `$impeccable layout`

### [P2] A full shift is an invitation here and a refusal on the board

- **Why it matters:** Sweeping is open, so the banner was not on screen. In source, a full shift says "This role is currently full. You can still try to sign up in case a spot opens up," and the button stays enabled. The board disables signup and says the shift is full.
- **Fix:** Use the board's rule. Disable the button and say the shift is full.
- **Suggested command:** `$impeccable clarify`

## Persona Red Flags

**Jordan (first-timer):** "Continue to Waiver" plus "Team / Club Affiliation" with thirteen names and no hint for someone who does not ride for a team. Nothing on this screen says the seat is not held.

**Casey (phone):** The action is a long thumb-scroll below the brief. "Log in" measures about 41×17. There is no Cancel. The error from the bottom button appears at the top of the form.

**Sam (keyboard):** Names, email, and emergency are labeled. The field focus ring is the browser's 1px outline, not the 2px Shift Blue ring used on the skip link. The emergency name includes an asterisk while `aria-required` is null. The error banner is not an alert. White on `#007bff` is about 4:1.

**A parent, from the signed-in source:** The public page has no under-18 question, so a parent on the shared link gets the volunteer's form. Once signed in, the block addresses the child ("I will be under 18," "sign the waiver on your behalf"). Confirm stays disabled until the parent fields are filled, and the disabled button does not say why.

## Minor Observations

- The document title stays "Berkeley Omnium Volunteer Hub" on the form and on the error.
- The summary card's shadow does not read on the night page. The card is a flat surface step, which matches the system. The shadow is leftover.
- Placeholders are about 3.5:1. The labels carry the question.
- The signed-in waiver is a 200px scroller. The under-18 checkbox is a default box, not a 44px target. Demo mode uses `alert()`.
- Leave the primary button's Action Blue. Recoloring it was deferred on the board.

## Questions to Consider

- If the board already refuses a full shift, why does this page tell someone to try anyway?
- Who is "Continue to Waiver" speaking to: the person filling this in, or the parent who will not see a guardian field until a later session?
- Should someone holding a broom have to pick among thirteen clubs before the club will email a link?
