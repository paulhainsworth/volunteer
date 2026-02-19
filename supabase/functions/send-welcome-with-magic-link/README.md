# send-welcome-with-magic-link

Sends the post–PII signup welcome email with a **one-click magic link** so the user doesn’t have to go to the login page and request another link.

## Env

- `RESEND_API_KEY` – same as `send-email`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – set by Supabase for edge functions

## Redirect URL

The `redirectTo` passed in the body (e.g. `https://yoursite.com/#/volunteer`) must be allowed in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.

## Magic link expiry (e.g. 730 hours)

To set magic link expiry to 730 hours (~30 days):

1. **Supabase Dashboard** → your project → **Authentication** → **Providers** → **Email**
2. Find **“Email OTP expiration”** or **“Magic link expiration”** (name may vary)
3. Set to `2628000` seconds (730 × 3600). If the dashboard caps the value (e.g. 86400), use the maximum allowed.

Expiry is a project setting; this function does not override it.
