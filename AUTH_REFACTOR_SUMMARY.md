# Magic-Link Auth Refactor — Summary (June 2026)

## The bug

Volunteers who had logged in before couldn't log in again with a new magic link, or ended
up **half-logged-in**: pages rendered and reads worked, but Supabase writes failed — they
couldn't change a volunteer role or sign up for a new one. Logging in from incognito always
worked perfectly, which pointed at persisted browser state rather than a server problem.

## Root causes (it was architecture, not a one-line bug)

Four interlocking problems, each previously patched around rather than fixed:

1. **Client deadlock.** The `onAuthStateChange` handler awaited `supabase.from('profiles')`
   inside the callback. supabase-js holds an internal auth lock while dispatching those
   events, and every query needs that same lock to read the session — so the whole client
   froze. Incognito escaped it because a fresh browser has no persisted session, so almost
   no auth events fire at startup.
2. **Self-inflicted session loss.** "Stall recovery" code raced `getSession()` against
   timeouts and **cleared localStorage when it lost** — destroying valid sessions moments
   after login. This produced ghost "signed-in" UI states.
3. **Stale-token bypass clients.** `supabaseUserRest.js` / `supabasePublic.js` created raw
   PostgREST clients that read the access token straight out of localStorage to dodge the
   frozen main client. Those tokens expire after an hour and were never refreshed — the
   exact "reads work, writes fail RLS" symptom.
4. **Tokens in the URL hash.** Magic links redirected back with `#access_token=...`, which
   collided with the hash-based SPA router (svelte-spa-router) and required polling loops,
   `detectSessionInUrl`, and module-load-time storage clearing.

## The new architecture

**Magic links no longer carry tokens.** The `send-magic-link` and
`send-welcome-with-magic-link` edge functions generate an OTP `token_hash` and email a link
straight to the app:

```
https://<app>/#/auth/confirm?token_hash=<hash>&type=magiclink[&post_login=waiver]
```

A new route, [src/routes/auth/Confirm.svelte](src/routes/auth/Confirm.svelte), exchanges it
with a single deterministic call — `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`
— waits for the profile, and routes to onboarding / waiver / my-signups. Expired or reused
links get a friendly error page with a "Request a new link" button.

Supporting changes:

- **[src/lib/stores/auth.js](src/lib/stores/auth.js) rewritten.** The auth event callback
  defers all work outside supabase-js's lock (no more deadlock); session applies are
  serialized so the store is always consistent when callers resolve; no code ever touches
  `sb-*` localStorage keys (supabase-js owns them).
- **One Supabase client.** `supabasePublic.js` and `supabaseUserRest.js` deleted; all reads
  and writes go through the single client, so RLS always sees a fresh token.
- **`detectSessionInUrl: false`** — nothing to detect anymore; can't race the router.
- **Route guards await `auth.ready()`** before reading auth state, fixing the related bug
  where reloading a deep link with a valid session bounced to the login page.
- All stall-recovery / timeout-race / polling / storage-wiping band-aids removed.
  Net: −110 lines despite the new route and docs.

## Constraints honored

Magic link + email login (no passwords), Supabase, Vercel, branded Resend emails, and the
`post_login=waiver` admin flow all work exactly as before — only the mechanics changed.

## Verification

- **Localhost (full UI):** first login → onboarding save → waiver signing → role signup →
  **second magic-link login over the existing session** (the bug scenario) → deep-link
  reload with persisted session → sign-out → reused-link error page. All green.
- **Staging (deployed):** token exchange, RLS read, RLS signup write + cancel, repeat
  login, edge-function link format, Resend send path, and a human click-through. All green.

## Operational notes

- One valid magic link per user at a time (standard Supabase): requesting a new link
  invalidates the previous one — which now shows the friendly error instead of wedging.
- Staging = branch `omnium2026` → Vercel preview → `volunteer-staging` Supabase project.
- **Production rollout requires both**: merge to `main` (Vercel ships the frontend) and
  deploy the two magic-link edge functions to the production Supabase project ref.
- Day-to-day invariants for future work live in [AUTH_ARCHITECTURE.md](AUTH_ARCHITECTURE.md).
