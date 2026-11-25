---
target: src/routes/Home.svelte
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/routes/Home.svelte"
target_fingerprint: "sha256:b848ef3196380ebe55d0857f2b59b706b4c63a7959a4e08f24a44bc02e9e4023"
target_path: src/routes/Home.svelte
timestamp: 2026-11-25T01-26-11Z
slug: src-routes-home-svelte
---
Method: dual-agent (A: 01a21049-bcba-7de2-8fca-bca664809cbf · B: 01a21049-bcba-7de2-8fca-bcb9453a1e1b)

Target: public homepage, `src/routes/Home.svelte` (`http://127.0.0.1:5173/#/` was up for the run; the page was not opened).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Loading roles…" is a static line. Auth can wait up to 5s and the fetch up to 20s, with no live region or retry. |
| 2 | Match System / Real World | 3 | The headline talks about shifts. Status copy says "roles," and a card never shows the hours. |
| 3 | User Control and Freedom | 3 | The logo returns home. Impact links leave the hub in the same tab. |
| 4 | Consistency and Standards | 2 | Guest copy mixes "shifts" and "roles." The button is `#0056b3` while dark links use `#4d9fff`. |
| 5 | Error Prevention | 2 | A full card is still a link. Nothing says a minor needs a guardian before the seat is real. |
| 6 | Recognition Rather Than Recall | 2 | Cards show name, short date, domain, and spots. Start, end, and place are missing. |
| 7 | Flexibility and Efficiency | 2 | Cards are in the tab order. Search, day jump, and critical-need sort live on Browse, not here. |
| 8 | Aesthetic and Minimalist Design | 2 | The board is flat, then a centered slogan and a `$28,610` / `6` block outrank the shift names. |
| 9 | Error Recovery | 2 | Failure offers Browse. Empty is "Check back soon." A timeout uses the same sentence and no retry. |
| 10 | Help and Documentation | 2 | The tagline states the job. Email sign-in, the emergency contact, and guardian consent are not on this page. |
| **Total** | | **22/40** | **Acceptable** |

All ten heuristics apply. This is the public entry to an Operate task (find a shift), so 7 and 10 are scored.

## Design Specificity Verdict

**LLM assessment:** The nouns belong to this club: the Berkeley Bicycle Club mark, the Berkeley Omnium, the Hills Road Race and the Streets Criterium, the 2026 dollar figure, and the named East Bay high school teams. The composition does not. A guest gets a centered campaign hero (`h1` at `3rem`, tagline at `1.5rem`), a hardcoded `#0056b3` button, then a fundraising panel, while the shift cards stay an equal grid. Swap the team names and another volunteer tool could ship this page. It does not yet read as "The Shift Board."

**Deterministic scan:** `impeccable detect` on `src/routes/Home.svelte` and `src/lib/components/Layout.svelte` exited 0 and still printed 15 advisory findings. Counts: `design-system-font-size` 9, `design-system-radius` 4, `design-system-color` 2. Home type drift is the tagline `1.5rem` (line 210), `0.9rem` (306), the impact `clamp(1.5rem, 5vw, 2.25rem)` (399), `2rem` (446), and `1.2rem` (450). Home shape drift is `8px` at lines 226 and 388. Home color drift is `rgba(0, 0, 0, 0.1)` and `rgba(0, 0, 0, 0.15)` at lines 326 and 333. Layout adds a `3px` radius (225), three `0.9rem` sizes (263, 284, 340), `1.25rem` (300), and another `8px` (367). The scan agrees with the hierarchy and token-drift judgment. It did not catch the missing schedule fields, the "roles" copy, or the absent waiver sentence. Those are outside its rules. The `8px` hits match a radius DESIGN.md already calls out. The rgba hits are shadow ink, not a second brand color.

**Visual overlays:** No overlay. Chrome DevTools could not attach: the browser profile at `/Users/kc/.cache/chrome-devtools-mcp/chrome-profile` was already running. Mutation was not tested. No user-visible overlay was injected.

## Overall Impression

The job is named in the first line, and the cards are real links. The page then spends its loudest type on the event story and a fundraising total. A guest still cannot tell whether a shift fits the day without opening it.

## What's Working

- The guest headline is the real job: "Find a volunteer shift," with one primary control, "Browse volunteer shifts," and cards that link to a shift.
- Open versus full is written in text ("N spots open" / "Full"), not color alone, on a flat hairline card.
- Load, failure, and empty are separate branches. Focus rings are on the button, cards, nav, and impact links. The menu and theme controls are 44px.

## Priority Issues

### [P1] Shift cards hide the schedule they ask you to judge

`Home.svelte` renders the name, a short date, the domain, and a spot count. It does not render start, end, location, or critical. A guest cannot tell a morning course marshal from another job without leaving.

**Why it matters:** The primary job is to find a shift that fits. The board withholds the facts that decide the fit.

**Fix:** Put the time range and place on the card, group by race day, and mark critical open spots the way Browse does.

**Suggested command:** `$impeccable clarify`

### [P1] The campaign outranks the board

The hero is centered at `3rem` / `1.5rem`. The impact figure scales to `2.25rem`. The shift section title is `1.375rem`. The detector's off-ramp sizes are this same stack: tagline, impact clamp, and the `2rem` / `1.2rem` lines under it.

**Why it matters:** The eye lands on the slogan and `$28,610` before it lands on an open seat.

**Fix:** Lead with the shift list. Keep one left-aligned line and the browse action. Put the fundraising story in one quiet sentence under the board.

**Suggested command:** `$impeccable layout`

### [P1] The homepage never sets up the confirmation stakes

A seat is confirmed only with the waiver the shift requires, including a guardian signature for anyone under 18. The first signed-in session collects an emergency contact. None of that is on this page.

**Why it matters:** A minor, and the parent who must sign, can start from a page that reads like the click claims the seat.

**Fix:** One sentence under the primary action: email sign-in, a guardian signature if under 18, and an emergency contact before the seat counts.

**Suggested command:** `$impeccable onboard`

### [P2] Empty and full are weak states

Empty copy has no action. Loading and failure are plain paragraphs with no status role. A full card keeps the same link treatment as an open one.

**Why it matters:** The long fetch can resolve to a dead end, and a full shift still looks choosable.

**Fix:** Announce the status swap, add retry on failure, and give the empty state the browse link. Drop full shifts from the featured six, or mark them unavailable.

**Suggested command:** `$impeccable harden`

### [P2] Two blues, and "roles" beside "shifts"

`.btn-primary` rests on `#0056b3` and presses to `#00458e`. Dark Shift Blue is `#4d9fff`. Loading and empty say "roles."

**Why it matters:** The action and the words for the same job disagree with the rest of the board.

**Fix:** Paint the button with the theme primary, and say "shifts" in every guest status line.

**Suggested command:** `$impeccable colorize`

## Persona Red Flags

**Jordan (first-timer):** The first action is clear, then the words split. "Loading roles…" and "No volunteer roles yet" sit next to "Volunteer shifts." The domain line has no label, so a domain name can read as a place. The card does not say the click opens details rather than claiming the seat. "NICA teams supported in 2026" leaves the acronym unexplained. Nothing says the next step is an email link.

**Casey (phone, one-handed):** Below 1100px, Sign In moves into the menu button ("Toggle menu"). The browse button stays in the hero, above the thumb. The hero still spends its padding before the first card. After the cards, the team and organization links are same-tab 44px hits, so a thumb can leave the hub while choosing a shift. There is no bottom action and no skeleton during the fetch.

**Sam (keyboard / low vision):** The theme control is only a sun or moon. Its accessible name is always "Dark mode" (`Layout.svelte`) while `aria-pressed` tracks whether dark is on, so the icon and the name can disagree. Loading, empty, and failure do not use a live region. There is no skip link into the shift list. "Full" is text, which is the part that works. The external list is a long tab run after the actual task.

## Minor Observations

- Homepage buttons and the mobile menu use `8px`, off the 4 / 6 / 12px scale. DESIGN.md already names the homepage exception. The detector also flags Layout's `3px` mark.
- Hover on the homepage button adds a shadow. It does not darken the fill. Only press goes to `#00458e`.
- The `$28,610` figure, the count of 6, and the school list are hardcoded. The homepage thank-you can come from a published website message.
- A signed-in feature grid still lives in `Home.svelte`. Guests do not see it. A session that has not redirected yet would.
- Featured shifts are date-ordered and capped at six. Critical need does not choose which six appear.
- Layout footer type at `0.9rem` and the nav title at `1.25rem` are off the documented ramp. They are shell chrome, not the board.

## Questions to Consider

- If the only job is to claim a shift, why is the loudest type on the page a fundraising total?
- Should a featured card that already says "Full" be on this board at all?
- Would a 16-year-old and their parent still start signup if the first screen said, in one line, that a guardian has to sign before the seat is real?
