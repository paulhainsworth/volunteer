# Implementation appendix — Option B + Phase 1 spine

**Status:** Draft.  
**Canonical proposal:** [`AUTH_DATA_ACCESS_MIGRATION.md`](./AUTH_DATA_ACCESS_MIGRATION.md) (problem statement, options, sequencing, **§11 caveats**).

This file stays **short**: concrete files, phases, and checkpoints for engineers. Narrative and rationale live in the migration doc.

---

## Sequencing (reminder)

1. **Phase 1 — Option A auth spine** (single session authority, callback route, no JWT-from-storage, narrow **instrumented** recovery behavior replacing today’s broader clears where safe).  
2. **Phase 2+ — Option B** (Edge Functions for private/admin).

---

## Phase map

| Phase | Focus |
|-------|--------|
| 0 | Inventory: all `supabase` / `supabasePublic` calls; classify risk; redirect allow-list |
| 1 | Auth spine (see migration doc §7–9, §11) |
| 2 | First 2–3 Edge endpoints (admin aggregate, volunteers, my-signups — product may adjust) |
| 3 | Migrate admin → leader → volunteer private screens |
| 4 | UX: degraded, callback failure, session expired |
| 5 | RLS / exposure audit |

---

## Key files (Phase 1)

| File | Change |
|------|--------|
| `src/App.svelte` | `#/auth/callback` route; trim duplicate post-login logic vs callback component |
| `src/lib/stores/auth.js` | Explicit `authSession` + `profileState`; remove storage JWT path |
| ~~`src/lib/supabaseUserRest.js`~~ | **Removed** — use `supabase` only |
| `src/lib/stores/domains.js`, `affiliations.js`, `RolesList.svelte` | Migrated off parallel PostgREST client |
| `src/lib/supabaseClient.js` | Revisit hash/stall clear per **§11.1** |
| Auth redirect | `signInWithMagicLink` / edge `send-magic-link` **`redirectTo`** + Supabase allow-list |
| `Layout.svelte` | Gating: `adminReady` before admin chrome |

---

## Edge Function pattern (Phase 2+)

- `Authorization: Bearer <access_token>` from `supabase.auth.getSession()` (never from manual `localStorage` parse).  
- Default: **Supabase client with user JWT** in Edge → **RLS applies**.  
- Service role only after explicit admin (or similar) check.

---

## Decision checkpoints

1. Hash `#/auth/callback` OK short-term? (Usually yes.)  
2. Exact `redirectTo` strings vs Supabase allow-list (see migration **§6.2** / **§11.2**).  
3. First three Edge routes — product priority.  
4. When to remove stall/hash clearing entirely vs narrow (§11.1).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-20 | Initial appendix + deep dive. |
| 2026-04-20 | Slimmed to appendix; full narrative in `AUTH_DATA_ACCESS_MIGRATION.md`; added §12 reference. |
