# send-magic-link

Sends a **magic link** email when a user requests a sign-in link from the login page (`#/auth/login`). Uses the same branded HTML as the revised magic-link template; email is sent via Resend.

**Admin / Communications:** With `sendEmail: false` and a valid **admin** JWT (`Authorization: Bearer …`), the function returns `{ action_link }` only (no email). The admin Communications page uses this to embed a per-recipient sign-in URL in bulk messages. The client passes `redirectTo` (e.g. `https://your-app/?post_login=waiver`) so that after login the app routes to emergency contact (if needed) then the waiver.

Add each concrete redirect URL to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**, for example:

- `https://www.berkeleyomnium.com/?post_login=waiver`
- `http://localhost:5173/?post_login=waiver`
- Preview deploys: `https://your-preview.vercel.app/?post_login=waiver`

## JWT verification (important)

This repo sets **`verify_jwt = false`** for `send-magic-link` in `supabase/config.toml` so the **Edge gateway** does not return **401** before your code runs (anon login requests and admin `{magic_link}` generation both hit this function). **Authorization is still enforced in code** for `sendEmail: false` (admin + profile check). Redeploy after changing `config.toml` so the setting applies.

## Deploy

```bash
supabase functions deploy send-magic-link
```

Set secrets (if not already set for other functions):

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
```

## Env

- `RESEND_API_KEY` – Resend API key
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – set by Supabase for edge functions

## CORS

The function returns proper CORS headers for browser calls from your app origin (e.g. `http://localhost:5173` or your Vercel domain).
