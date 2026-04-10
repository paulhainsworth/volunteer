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

## Troubleshooting: `Database error finding user`

`auth.admin.generateLink({ type: 'magiclink' })` looks up **`auth.users` by email**. This error usually means there is **no Auth user** for that address, or **email casing** in `profiles` does not match Auth (the function lowercases the address before generating the link).

Check in SQL (staging/production):

```sql
-- Profiles whose id does not exist in auth.users (should be empty if FKs are intact)
SELECT p.id, p.email
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Same email different casing between profile and auth (manual inspection)
SELECT p.email AS profile_email, u.email AS auth_email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(p.email) <> lower(u.email);
```

Volunteers must have signed up or been created through flows that create **`auth.users`** + **`profiles`**.

## Env

- `RESEND_API_KEY` – Resend API key
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – set by Supabase for edge functions

## CORS

The function returns proper CORS headers for browser calls from your app origin (e.g. `http://localhost:5173` or your Vercel domain).
