# Phase 1 — Auth spine implementation checklist

**Branch:** `omnium2026` (canonical for this work).  
**Specs:** [`AUTH_DATA_ACCESS_MIGRATION.md`](./AUTH_DATA_ACCESS_MIGRATION.md), [`TARGET_ARCHITECTURE_OPTION_B_SPEC.md`](./TARGET_ARCHITECTURE_OPTION_B_SPEC.md).

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

- [ ] Introduce explicit **`authSession`** / **`profileState`** (or equivalent) in `auth.js` store — loading / signed-out / signed-in / degraded / error.
- [ ] Align `Layout` / route guards with the state machine (incremental; avoid big-bang).

---

## Storage recovery (instrument, narrow)

- [ ] Inventory all **`localStorage` / `sessionStorage`** clears touching Supabase keys in `supabaseClient.js` and auth paths.
- [ ] Replace **broad heuristic** callback/login clears with **narrow** rules; add **logging/metrics** for each clear path (see migration **§4.4**, **§11.1**).
- [ ] Keep bounded stall recovery **outside** active callback processing where still needed; review after instrumentation.

---

## Remove alternate PostgREST / JWT side channel — **conditional**

- [ ] Add **bounded timeouts** for `getSession` / critical auth calls where missing.
- [ ] Add **visible** session-error / retry UX for “signed in but queries fail” and GoTrue hang cases.
- [ ] **Then** remove **`getUserPostgrestClient`** and migrate callers to the single Supabase client (see migration **§6.1**).

---

## Central route gating

- [ ] **`adminReady`** (or equivalent) before showing admin chrome — verify all admin routes respect it.
- [ ] Document guard order: session → profile → role.

---

## Observability (incremental)

- [ ] Log or client metric: callback entered, session recovered / timeout, profile hydrate ok/error, forced re-auth.

---

## RLS audit (Phase 5 — track early)

- [ ] Maintain a running list of **tables/views/rpc** accessed from browser and Edge; Phase 5 full audit is **mandatory** (migration **§8**, **§3**).

---

## Changelog

| Date | Notes |
|------|--------|
| 2026-04-20 | Initial checklist; first code slice: callback route + shared completion helper + `redirectTo`. |
