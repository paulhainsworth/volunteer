# Berkeley Omnium Volunteer Hub — Authentication and Data Access Migration Proposal

**Status:** Canonical architecture and migration plan (iterate here).

**Companion docs:** [ARCHITECTURE.md](../ARCHITECTURE.md) (especially **§7.1–§7.3** — Phase 1 implementation + double-hash incident), [SECURITY.md](../SECURITY.md), [PHASE1_IMPLEMENTATION_CHECKLIST.md](./PHASE1_IMPLEMENTATION_CHECKLIST.md), [TARGET_ARCHITECTURE_OPTION_B_SPEC.md](./TARGET_ARCHITECTURE_OPTION_B_SPEC.md), [RLS_EXPOSURE_INVENTORY.md](./RLS_EXPOSURE_INVENTORY.md).

---

## Executive summary

**Final recommendation**

Adopt **Option B** as the target architecture, implemented in **two stages**:

1. **Phase 1 — Option A–style auth spine:** single session authority; **dedicated callback handling**; explicit session/profile states; central route gating; removal of raw JWT side channels; **narrowed, instrumented** recovery behavior (not wholesale deletion of existing clears).
2. **Phase 2+ — Option B:** migrate private/admin operations toward **Edge Functions** — server-mediated shaping for sensitive screens; **user-context RLS by default** in functions; **narrow** use of service role only where required.

This sequencing **reduces split-brain risk first**, then **reduces browser-side private data surface** second.

**North star:** keep browser-based Supabase Auth; do **not** hide the anon key as the primary fix; **RLS audit is mandatory** (see §3, §8, Phase 5).

---

## Purpose

Eliminate persistent auth failures (magic link not logging in, UI vs queries diverging, incognito more reliable than normal) by replacing split-brain auth with **one session authority**, **one callback story**, and **explicit** states—then shifting sensitive reads to Edge Functions.

---

## Non-goals

- **Not** attempting to hide the Supabase anon/publishable key from the browser (SPA model; security = RLS + secrets server-side).
- **Not** replacing the need for a **full RLS audit** on exposed tables, views, and functions (see Phase 5 — **required**, not “cleanup later”).
- **Not** requiring a full backend-for-frontend in Phase 1.
- **Not** guaranteeing that **every** current storage-clear path can be removed immediately — replace with **narrow, evidence-based, instrumented** recovery where clears address **real** stale-refresh / hung-session pathologies.

---

## 1. Problem statement

Recurring failures:

- Magic link lands but user is not actually logged in  
- UI looks logged in; authenticated queries fail  
- Navigation reveals effective logout  
- Incognito more reliable than normal mode  

### Likely root cause

Overlapping authorities: GoTrue session, persisted storage, Svelte store, profile hydration, **alternate PostgREST via raw JWT** (`getUserPostgrestClient`), and **inconsistent** route guard timing → split-brain (nav vs query paths disagree).

---

## 2. Security clarification

The **anon key in the browser is not the root auth bug** if RLS is correct. Security depends on **RLS**, user JWT context, and **service-role keys server-side only**.

Real issues: fragmented session authority, **broad/heuristic** storage clearing, raw token side channels, too many direct browser paths to private/admin data.

---

## 3. Design goals

**Reliability** — magic-link completes; chrome never implies usable auth when queries already fail; sleep/tabs predictable.

**Simplicity** — one session authority; one callback flow; one readiness model.

**Security** — no privileged keys in browser; **no raw JWT-from-storage for API auth**; server authorization authoritative; **RLS audit mandatory** — browser anon exposure is only safe where RLS is correct on **every** exposed path. Edge Functions add control but **do not substitute** for auditing database access.

**Operability** — failures observable; degraded states explicit.

---

## 4. Shared principles

### 4.1 One authenticated client path

No reading JWT from `localStorage` to authorize data access; no second PostgREST stack parallel to the active Supabase session.

### 4.2 Separate auth from profile

Explicit session vs profile state machines (§6).

### 4.3 Dedicated callback handling

Target a **dedicated callback route** (e.g. `#/auth/callback`). See **§6.2** — **handler** vs **first landing URL** are not always the same.

### 4.4 No broad heuristic storage destruction during login

**Narrow and justify** auth-related storage clearing rather than removing it blindly.

The app includes clears for **stale refresh blocking new tokens** and **hung `getSession`**. The migration should **eliminate broad, heuristic** clearing during callback/login, but may retain **narrow** clears: after **confirmed** invalid session, **bounded stall recovery** **outside** active callback processing, or after **explicit** failed exchange. **Instrument** all such clears and review.

### 4.5 Private/admin operations move server-side over time (Phase 2+)

### 4.6 RLS remains the core data security layer

---

## 5. Architecture options (summary)

| Option | Summary | Role |
|--------|---------|------|
| **A** | Simplified browser-first: one client, no JWT side channel, callback, explicit states | **Phase 1 foundation** |
| **B** | Browser auth + Edge-mediated private/admin ops | **Target** after Phase 1 |
| **C** | Full BFF | **Reserved** unless scope/compliance requires |

---

## 6. Target design (Option B; Phase 1 covers auth half)

### 6.1 Session authority

- **Canonical:** single Supabase browser client for session-backed API auth.
- **Remove `getUserPostgrestClient` / raw JWT-from-storage** only **once:** single-session model is in place, **bounded auth timeouts**, and **explicit session-error / retry UX** exist — so GoTrue “escape hatch” is replaced by **visible, bounded** failure handling, **not** silent hangs.

### 6.2 Dedicated callback flow — handler vs landing URL

**Dedicated callback handling is required**, but **initial landing** must match **actual Supabase redirect + email behavior**.

- **Target:** route such as `/auth/callback` or **`#/auth/callback`** (hash SPA).
- **Important:** Supabase **redirect URL configuration** and **`redirectTo`** determine the **first** URL the browser loads. With **hash routing**, auth parameters may appear on **`/`** before the SPA router resolves `#/auth/callback`, or tokens may be merged into the fragment in ways that depend on project settings.

**Implementation must:**

1. **Validate in staging/prod** where tokens land relative to the path (including PKCE `?code=` vs hash tokens).  
2. If tokens consistently hit **`/`** first, add a **minimal early step** (e.g. redirect into callback handling **before** general bootstrap/recovery) **without** losing fragments — **document** the chosen behavior.

Supabase **Site URL / Redirect URL allow-list** must include every URL used in `redirectTo` (prod, preview, apex, `www`).

### 6.3 Route gating

Central model: loading shells; signed-out; profile degraded; **`adminReady`** before admin chrome (see `Layout.svelte` and Phase 4 UX work).

### 6.4 Data boundaries (Phase 2+)

Browser-direct only where intentional (public/safe); sensitive screens behind Edge Functions; **user-context client + RLS** by default in functions.

### 6.5 Observability

Instrument: callback entered, session ok/missing, profile ok/missing/error, refresh failed, forced re-auth.

---

## 7. What changes first vs later

| First (Phase 1 spine) | Later (Phase 2+ B) |
|------------------------|---------------------|
| Callback handling (route + validated landing) | Broader Edge API migration |
| Session + profile state model | Larger server-side shaping |
| Central route gating | Optional tightening of remaining public direct reads |
| Remove raw JWT side channel (**after** timeout/error UX) | Deep authorization/capability model changes |
| Instrument recovery behavior | — |

---

## 8. Migration plan

| Phase | Scope |
|-------|--------|
| **0 — Inventory** | Map all `supabase` / `supabasePublic` / custom clients; classify risk; **redirect allow-list**; guards. |
| **1 — Auth spine** | Dedicated callback; explicit `authSession` / `profileState`; **narrow and instrument** storage-clearing (not wholesale delete); **remove alternate PostgREST path only after** bounded timeout/error UX; central gating; instrumentation. |
| **2 — First Edge APIs** | 2–3 high-value endpoints. |
| **3 — Expand** | Admin → leader → volunteer private. |
| **4 — UX** | Degraded, callback failure, session expired. |
| **5 — RLS audit** | **Required phase** — every exposed table/view/function used from browser or Edge; **not** optional follow-up. |

---

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Callback URL mismatch (prod/apex/www/preview) | Checklist + Supabase allow-list |
| Edge sprawl | Start with 2–3 endpoints |
| Duplicating RLS in TS | User-context Supabase in functions first |
| Removing storage clears reintroduces magic-link / stale-refresh hangs | **Narrow, measured** recovery + callback-aware stall handling; instrument |
| Callback route added but tokens still land on `/` first | Validate real redirects; minimal pre-router redirect if needed |
| Over-migrating public reads | Keep intentional anon reads until justified |
| **`redirectTo`** includes a **hash route** (e.g. `/#/auth/callback`) | Supabase **appends** `#access_token=…`, producing **`#/auth/callback#access_token=…`** — normalize early (see §11.7) or use a **`redirectTo`** without a pre-set hash fragment. |

---

## 10. Decision matrix

| Criterion | A | B | C |
|-----------|---|---|---|
| Migration effort | Low | Medium | High |
| Auth reliability | High | Very high | Very high |
| Private/admin control | Medium | High | Very high |
| Browser DB surface | Medium | Low | Very low |
| Fit current size | Good | **Best** | Often heavy |

---

## 11. Implementation caveats and guardrails

*(Formerly “review feedback” — durable engineering notes, not debate transcript.)*

### 11.1 Storage clearing

Do not delete all recovery paths because the doc opposes “speculative” clears. **Replace** broad heuristics with **narrow, instrumented** rules; **measure** before/after.

### 11.2 Callback URL vs first paint

Validate **Supabase + email** flows; tokens may not arrive first on `#/auth/callback` without an explicit bootstrap step §6.2.

### 11.3 Removing `getUserPostgrestClient`

**Conditional** on: single session authority, **bounded timeouts**, **visible** session-error/retry — avoid reintroducing silent GoTrue hangs.

### 11.4 RLS

**Mandatory** audit (Phase 5). Mis-RLS is the primary data-exposure risk regardless of Edge adoption.

### 11.5 Edge + duplication

Acceptable if functions default to user-context + RLS; service role **narrow**.

### 11.6 Option C

Reserve unless product demands full BFF.

### 11.7 Double-hash URL when `redirectTo` contains a hash route

Supabase constructs magic links by **appending** `#access_token=…` (and related query-style fields) to whatever **`redirectTo`** the client sends.

If **`redirectTo`** is already a hash-routed SPA URL — for example **`https://app.example.com/#/auth/callback`** — the final link contains **two `#` delimiters**:

`https://app.example.com/#/auth/callback#access_token=…`

That URL shape can prevent **`detectSessionInUrl`** from establishing a session reliably and can interact badly with hash routers and with early **storage / hash** logic in the client. **Dedicated callback handling alone does not fix this**; the app must either:

- **Normalize** the URL **before** the Supabase client finishes consuming the fragment (this repo: **`index.html`** + **`src/normalizeMagicLinkHash.js`** via **`location.replace`** to a **single** fragment `#access_token=…`), or  
- Use a **`redirectTo`** **without** embedding the SPA route in the fragment (e.g. **`origin + '/'`** only), accepting a different first-paint route.

**Operational check:** After changing **`redirectTo`**, click a **real** magic link and confirm the **address bar fragment** and that the user ends **signed in**. The first test with **`/#/auth/callback`** failed until normalization; the second test passed.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-20 | Initial drafts. |
| 2026-04-20 | Final: non-goals, first-vs-later table, softened storage language, callback landing §6.2, conditional `getUserPostgrestClient` removal, mandatory RLS, §11 rename, risks rows, executive summary. |
| 2026-04-21 | §11.7 double-hash `redirectTo` + token append; risk row; cross-ref to `ARCHITECTURE.md` §7.1–7.3 (Phase 1 implementation + incident). |
