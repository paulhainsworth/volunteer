# Phase 1 — Auth spine implementation checklist

**Branch:** `omnium2026` (canonical for this work).  
**Specs:** [`AUTH_DATA_ACCESS_MIGRATION.md`](./AUTH_DATA_ACCESS_MIGRATION.md), [`TARGET_ARCHITECTURE_OPTION_B_SPEC.md`](./TARGET_ARCHITECTURE_OPTION_B_SPEC.md), [`RLS_EXPOSURE_INVENTORY.md`](./RLS_EXPOSURE_INVENTORY.md).

---

## Preconditions

- [ ] Supabase **Redirect URLs** include every env: `http://localhost:5173/**`, Vercel previews, production apex + `www`, and the exact `redirectTo` strings below.
- [ ] Team agrees **`/#/auth/callback`** (or chosen URL) is on the allow list before enabling production magic links with the new `redirectTo`.

---

## Callback route + landing validation

- [x] Extract shared **`completeMagicLinkAfterRedirect`** (wait for session → hydrate → `replace`) — single implementation for magic-link completion.
- [x] Default login **`redirectTo`**: `origin + '/#/auth/callback'` in `auth.signInWithMagicLink`.
- [x] Add **`/auth/callback`** route with a clear “Completing sign-in…” shell while `App` runs the completion loop.
- [ ] **Staging/prod validation:** where Supabase places tokens vs path (`/`, `#/auth/callback`, `?code=` PKCE). Document in `ARCHITECTURE.md` or this file.
- [ ] If tokens **always** hit `/` first: implement minimal pre-router redirect into callback handling **without** losing tokens (see migration **§6.2**).

---

## Session / profile explicit states

- [x] Introduce explicit **`authSession`** / **`profileState`** / **`adminReady`** / **`sessionWarning`** / **`bootstrapTimedOut`** in `auth.js` (`withDerived`).
- [x] Align `Layout` — admin nav uses **`adminReady`**; session warning banner + retry/dismiss.

---

## Storage recovery (instrument, narrow)

- [x] **`authRecoveryLog(reason)`** + per-call **`clearPersistedSupabaseAuthKeys(..., reason)`** (module hash pre-clear, stall recovery, sign-out).
- [ ] Replace **broad heuristic** callback/login clears with **narrow** rules where still needed after reviewing `[authRecovery]` logs in staging.
- [x] Stall recovery logic unchanged but **instrumented**; optional further narrowing TBD.

---

## Remove alternate PostgREST / JWT side channel — **conditional**

- [x] **`hydrateFromSession`** uses bounded **`getSession`** timeout + fallback path + store warning.
- [x] **Visible** session banner (`sessionWarning`, degraded profile, bootstrap timeout) + **Retry** / **Dismiss**.
- [x] **Removed `getUserPostgrestClient`** — `domains.js`, `affiliations.js`, **`RolesList.svelte`** use **`supabase`** only; **`supabaseUserRest.js`** deleted (see migration **§11.3**).

---

## Central route gating

- [x] **Layout** admin links gated by **`$auth.adminReady`** (session loaded + admin profile). Page-level **`ensureAdminRouteReady`** unchanged.
- [ ] Document guard order: session → profile → role (extend `ARCHITECTURE.md` §6 if needed).

---

## Observability (incremental)

- [x] **`authObs`** (dev `console.debug`) + **`[authRecovery]`** `console.info`; magic-link **`authObs`** events in `completeMagicLinkAfterRedirect`.

---

## RLS audit (Phase 5 — track early)

- [x] Starter list: [`RLS_EXPOSURE_INVENTORY.md`](./RLS_EXPOSURE_INVENTORY.md) (expand + check off RLS reviewed).

---

## Changelog

| Date | Notes |
|------|--------|
| 2026-04-20 | Initial checklist; first code slice: callback route + shared completion helper + `redirectTo`. |
| 2026-04-20 | Auth spine: derived session states, Layout banner + `adminReady`, `authRecoveryLog`, `authObs`, RLS inventory stub, hydrate timeout. |
| 2026-04-21 | Removed `getUserPostgrestClient` / `supabaseUserRest.js`. |
