# Security notes — browser auth & Supabase

Living document. Complements **[ARCHITECTURE.md](./ARCHITECTURE.md)** (auth flow, storage keys, clients).

## Context

There is **no prior standalone security write-up** in this repository from an earlier review; this file captures **current understanding** from code inspection and standard Supabase SPA behavior.

## Supabase auth tokens in the browser (finding)

### What happens

The official Supabase JavaScript client persists the session (including **access** and **refresh** tokens) in the browser so a single-page app can call PostgREST and Auth without a server-side session cookie. In this project, that storage is **`localStorage`** under keys like `sb-<project-ref>-auth-token` (see `src/lib/supabaseClient.js`).

So: **tokens are intentionally present in browser storage** for logged-in users. They are not “leaked” by accident in the sense of a misconfiguration—they are **how client-side Supabase Auth is designed to work** for SPAs.

### What that implies (threat model)

| Concern | Notes |
|--------|--------|
| **Same-origin scripts** | Any XSS on your origin can read `localStorage` and exfiltrate tokens. **Primary mitigation:** strict CSP, sanitize HTML, careful third-party scripts, dependency hygiene—not “hide” tokens from JS. |
| **Physical / shared device** | Anyone with access to an unlocked browser profile can use DevTools → Application → localStorage. Session length and sign-out UX matter. |
| **Extensions** | Malicious or compromised extensions can read storage on your origin. Users may need guidance (incognito, disable extensions for testing). |
| **Magic-link URL** | Tokens may briefly appear in the **hash** or as **PKCE `?code=`** before exchange. Mitigations are mostly Supabase + redirect configuration; avoid logging full URLs in client analytics. |

**Authorization still happens on the server:** Postgres **RLS** and Edge Functions using the **service role** are what protect data. The JWT proves identity; policies decide what rows are visible.

### App-specific: reading tokens outside Supabase JS

**None.** The app **does not** parse JWTs from storage or build a parallel PostgREST client. A historical **`getPersistedAccessToken` / `getUserPostgrestClient`** helper was **removed** (Phase 1 auth spine); all queries use the shared **`supabase`** client from `src/lib/supabaseClient.js`.

**Policy:** do **not** reintroduce ad-hoc `localStorage` JWT readers; grep periodically (see open questions in `ARCHITECTURE.md`).

### What this is *not*

- It is **not** the same as exposing the **service role** key in the client (we use the **anon** key in the app; service role stays server-side).
- It is **not** a reason to move normal Supabase user JWTs to HttpOnly cookies **without** an architecture change—that would require a different auth flow (e.g. server middleware), not a quick toggle.

## Hardening checklist (incremental)

- [ ] **CSP** and minimal inline script where possible (see `PRODUCTION_READINESS_ROADMAP.md` / priorities docs if present).
- [ ] **Redirect URL allow-list** in Supabase matches only real app origins (avoid open redirects).
- [ ] **Periodic dependency audit** (`npm audit`, Renovate, etc.).
- [ ] **Do not** log full magic-link URLs or storage contents in production analytics.
- [ ] Re-**grep** for `localStorage`, `getItem`, `access_token` when adding features.

## Changelog

| Date | Change |
|------|--------|
| 2026-04-20 | Initial `SECURITY.md`: browser token storage, threat model, pointers to `ARCHITECTURE.md`. |
| 2026-04-21 | Document removal of parallel PostgREST / storage JWT parse (`supabaseUserRest.js`). |
