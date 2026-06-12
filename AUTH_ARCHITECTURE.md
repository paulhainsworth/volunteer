# Auth Architecture

How magic-link auth works after the June 2026 refactor, and the rules that keep it working.

## The flow

1. User enters their email on `#/auth/login`. The app calls the `send-magic-link` edge
   function, which uses the service role to `generateLink({ type: 'magiclink' })` and emails
   the branded message via Resend.
2. The emailed link points at **our app**, not GoTrue:
   `https://<app>/#/auth/confirm?token_hash=<hashed_token>&type=magiclink[&post_login=waiver]`
3. The `#/auth/confirm` route ([src/routes/auth/Confirm.svelte](src/routes/auth/Confirm.svelte))
   exchanges the token with `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`,
   waits for the profile row, and routes to onboarding / waiver / my-signups.

No access or refresh tokens ever appear in a URL. The exchange is a single deterministic
API call — there is no `detectSessionInUrl`, no hash parsing, no polling.

## Why it's built this way

The previous design used GoTrue `action_link`s, which redirected back to the app with
`#access_token=...` in the hash fragment. That collided with the hash-based SPA router
(svelte-spa-router) and required `detectSessionInUrl` plus polling and manual localStorage
clearing. Combined with `await supabase.from(...)` calls inside `onAuthStateChange` —
which deadlocks supabase-js, because the client holds its auth lock while dispatching
events — sessions would wedge for returning users. Timeout "recovery" code then wiped
localStorage, producing half-logged-in states where reads worked but RLS writes failed.
Incognito worked because there was no persisted state to wedge against.

## The rules (please keep these)

1. **Never await Supabase calls inside the `onAuthStateChange` callback.** Schedule work
   with `setTimeout(..., 0)`. See `initListener()` in
   [src/lib/stores/auth.js](src/lib/stores/auth.js).
2. **One Supabase client.** No extra PostgREST clients reading tokens out of localStorage —
   they bypass token refresh and go stale after an hour (`exp` on the access token).
3. **Never touch `sb-*` localStorage keys by hand.** supabase-js owns them; it clears them
   on sign-out and invalid refresh tokens.
4. **Route guards await `auth.ready()`** before reading `$auth.user` / `$auth.profile`,
   because auth bootstrap is asynchronous and pages mount before it finishes.
5. New magic-link emails must link to `#/auth/confirm?token_hash=...` (see the
   `send-magic-link` and `send-welcome-with-magic-link` edge functions). Don't reintroduce
   `action_link` redirects.
