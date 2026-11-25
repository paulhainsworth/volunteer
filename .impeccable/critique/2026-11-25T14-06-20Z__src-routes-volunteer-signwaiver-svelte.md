---
target: src/routes/volunteer/SignWaiver.svelte
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/routes/volunteer/SignWaiver.svelte"
target_fingerprint: "sha256:b54732f1cc9a1534cd752a9d06599d3c2bcff822a55ae62020c3adb02fbe9567"
target_path: src/routes/volunteer/SignWaiver.svelte
timestamp: 2026-11-25T14-06-20Z
slug: src-routes-volunteer-signwaiver-svelte
---
Method: dual-agent (A: 01a212f3-ea79-7e20-a47f-ae0d92a5f884 · B: 01a212f3-ea79-7e20-a47f-ae1951851769)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Loading waiver..." and a failed load show. A disabled "Sign waiver" never says why. |
| 2 | Match System / Real World | 3 | "How old are you today?" is plain. "Optional volunteer assent" is the odd phrase. |
| 3 | User Control and Freedom | 3 | Cancel returns to My Signups. Age can be switched. There is no second confirm. |
| 4 | Consistency and Standards | 2 | The shell uses a 2px Shift Blue ring. This form uses a 1px browser ring and an 8px card. |
| 5 | Error Prevention | 2 | The button stays off until age, agreement, and names. "not-an-email" still enables it. |
| 6 | Recognition Rather Than Recall | 3 | The legend, labels, and "Test Volunteer" stay on the page. The adult signature has no required mark. |
| 7 | Flexibility and Efficiency | 2 | Tab and arrow keys work. Enter in a field does not sign. |
| 8 | Aesthetic and Minimalist Design | 2 | One column. The age fieldset is a wide empty groove, and the minor path repeats the same promise. |
| 9 | Error Recovery | 2 | A failed load is a plain banner plus Back. The submit sentences in the script never appear. |
| 10 | Help and Documentation | 2 | A subtitle and a parent intro. Nothing explains a disabled button or what the signature covers. |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** The shell is the Berkeley Omnium board: the club mark, "Omnium Volunteer Hub," a dark page, and a flat hairline card. The waiver task is a generic liability form. It never names the Omnium, a shift, or the East Bay teams. The under-18 guardian gate is a real product rule. The age control, the twin gray buttons, and "before using the volunteer hub" could sit on any volunteer signup.

**Deterministic scan:** `impeccable detect` on `src/routes/volunteer/SignWaiver.svelte` exited 0 with 9 advisory hits. Three `design-system-radius` hits are `border-radius: 8px` at lines 224, 239, and 298 (alert, waiver card, parent card), off the 4/6/12 scale. Four `design-system-font-size` hits: `1.5rem` on the title (line 207) and `0.9rem` at lines 255, 280, and 310. Two `design-system-color` hits are `#5a6268` on the secondary button border and hover (lines 350 and 354). Action Blue `#007bff` was not flagged. `#00458e` is absent. The 8px radii are real. `#5a6268` is the existing gray button edge, worth a token later, not the task.

**Visual overlays:** Mutation stuck in headless Playwright (`document.title` and an appended script). `detect.js` from `http://localhost:8400/detect.js` logged 3 anti-patterns: white on `#4d9fff` at 2.7:1, white on `#007bff` at 4.0:1, and a nested card. No user-visible [Human] overlay was shown. The 4.0:1 pair is the existing Sign waiver button. White on Shift Blue is the signed-in shell, not a color this page introduces. The parent card inside the waiver card is the guardian group, so the nested-card hit is low signal.

## Overall Impression

The page can collect an adult signature and a real guardian block. The age question looks broken, the disabled button looks like Cancel, and a bad parent email can still sign. Those three are the pass.

## What's Working

- "I am under 18 today" opens a guardian block, and the attestation names the signed-in volunteer: "I am the parent or legal guardian of Test Volunteer…"
- The adult signature prefills "Test Volunteer" from the profile.
- A failed load is a danger banner plus "Back," on a flat hairline card. "Loading waiver..." is plain.

## Priority Issues

**[P1] The age answers are detached from their dots.** `.form-group input { width: 100%; max-width: 400px }` hits the radios inside `fieldset.form-group`. At 1280 the dot is a 400×13 control and "I am under 18 today" starts far to the right. At 390 the dot sits on its own line and the sentence wraps under it. The fieldset is a 2px groove.

**Why it matters:** The first question on a legal signature is the one that looks unfinished. A minor and a parent can miss which sentence belongs to which dot.

**Fix:** Keep radios out of the text-input rule. Put each dot and its sentence on one line. Drop the groove for a hairline or no border.

**Suggested command:** `$impeccable layout`

**[P1] "Sign waiver" goes quiet and turns into a second Cancel.** Until age, agreement, and the required names are set, the button is `disabled` and `rgb(108, 117, 125)`, the same gray as Cancel. Checking only "I have read and agree to the waiver above" changes nothing else. Clearing the prefilled name keeps it disabled. The sentences in `handleSubmit` never appear, because the button will not click.

**Why it matters:** A first-timer cannot tell whether the form is broken or which field is missing.

**Fix:** Say what is still missing beside the button. Keep the disabled primary visually distinct from Cancel.

**Suggested command:** `$impeccable clarify`

**[P1] A parent email the browser already marks invalid can sign.** "not-an-email" matches `:invalid`. The border stays `rgb(98, 110, 126)`. With age, the agree box, the parent name, and the parent signature set, "Sign waiver" enables. There is no `<form>`, so the browser does not block it.

**Why it matters:** The guardian email is how the parent is told to sign. A typo sends that notice nowhere, and the minor still believes the waiver went through.

**Fix:** Keep the button disabled until the email matches a simple address pattern, and show "Enter a valid parent/guardian email" on that field.

**Suggested command:** `$impeccable harden`

**[P2] These controls do not match the board's focus, height, or placeholder.** Keyboard focus is `1px auto rgb(153, 200, 255)` (light: `rgb(0, 95, 204)`), offset 0 on the signature and on Sign waiver. The skip link beside them is `2px solid` Shift Blue, offset 2px. Text inputs are 39px tall (`min-height: 0`). Dark placeholders such as "(555) 123-4567" are `rgb(117, 117, 117)` on `rgb(59, 59, 59)`, contrast 2.43:1. The agree box is 13×13.

**Why it matters:** The claim form just grew a 44px field, a muted placeholder, and a 2px ring. This page is the next step and drops all three. The placeholder fails WCAG AA.

**Fix:** Use the board's field rules: 44px min height, `var(--text-muted)` placeholders, and `outline: 2px solid var(--primary-color); outline-offset: 2px` on keyboard focus. Leave resting Action Blue `#007bff` alone.

**Suggested command:** `$impeccable polish`

**[P2] The guardian promise is said twice, and the page never says what signing finishes.** The attestation and "I have read the waiver above and agree to it on behalf of Test Volunteer." repeat each other. The subtitle is only "You need to sign the liability waiver before using the volunteer hub." Cancel does not say it returns to My Signups. The checkbox speaks as the guardian while the minor is the person signed in. The terms sit in a 280px scroller (456px of text at 1280, 672px at 390) and the agree box is outside that scroller.

**Why it matters:** Someone can agree without reading, and nobody is told whether this signature covers a shift or only "the hub."

**Fix:** One consent sentence. Name the return on Cancel. Say the signature covers this volunteer's shifts. Leave the waiver prose itself alone.

**Suggested command:** `$impeccable clarify`

## Persona Red Flags

**Jordan (first-timer):** The two age sentences sit across an empty groove from their dots. Jordan checks "I have read and agree to the waiver above." "Sign waiver" stays gray, identical to "Cancel," with no reason. "Your full name (optional volunteer assent)" does not say what assent means. On the minor path the checkbox already speaks as the parent.

**Sam (keyboard):** Tab order reaches the terms, the age radios (ArrowUp switches them), the signature, the 13×13 agree box, Cancel, and Sign waiver. Disabled "Sign waiver" cannot take focus. Focus on the form is a 1px browser ring. The load banner has no live-region role. "not-an-email" does not change the email border.

**Casey (phone, 390):** No horizontal overflow. The minor page is about 1686px tall, so Sign waiver is a long thumb scroll below the terms. The age dot sits above its sentence. Inputs are 39px. Placeholders at 2.43:1 are hard to read in daylight. While the parent fields are empty, Cancel and Sign waiver are the same gray.

## Minor Observations

- Cancel is about 52px tall and Sign waiver is 42px, so the pair looks uneven.
- Alert, waiver card, and parent card are 8px, off the 4/6/12 scale. The card has a 1px hairline and no shadow.
- The optional assent field stays empty. The attestation still uses the profile name, which is the right person, and the assent field does not feed that sentence.
- Light theme: page `rgb(245, 247, 250)`, subtitle contrast about 4.37:1, placeholder about 4.61:1. White on settled Action Blue is about 3.98:1. That blue stays.
- `.checkbox-group.minor-toggle` is unused.
- A load failure still prints `err.message`.
- `sign_volunteer_waiver` was not called.

## Questions to Consider

- If the minor is the person signed in, why does the checkbox speak as the guardian before the parent name is filled?
- Should this signature name the volunteer's shifts, or only "using the volunteer hub"?
- Why may a parent email the browser already marks invalid light "Sign waiver"?
