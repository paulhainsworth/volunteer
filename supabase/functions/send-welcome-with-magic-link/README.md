# send-welcome-with-magic-link

Sends the post–PII signup welcome email with a **one-click magic link** so the user doesn’t have to go to the login page and request another link.

## Env

- `RESEND_API_KEY` – same as `send-email`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – set by Supabase for edge functions

## Redirect URL (fix: magic links pointing to wrong origin)

The app sends `redirectTo: window.location.origin + '/'` so the link matches where the user signed up (localhost, Vercel preview, or production). **Supabase only uses this if the exact URL is in the allow list.** If it’s not, Auth falls back to **Site URL** (often production), so magic links always go to production.

**Fix:** In **Supabase Dashboard** → **staging project** → **Authentication** → **URL Configuration**: (1) Set **Site URL** to your staging URL (e.g. `https://volunteer-git-omnium2026-paul-hainsworths-projects.vercel.app`), not localhost. (2) In **Redirect URLs**, add every origin you use, for example:

- `http://localhost:5173/`
- `https://volunteer-git-omnium2026-paul-hainsworths-projects.vercel.app/`
- `https://*.vercel.app/` (all Vercel previews)
- Production, e.g. `https://www.berkeleyomnium.com/`

After adding these, magic links will redirect to the same environment the user was on when they signed up.

## Magic link expiry (e.g. 730 hours)

To set magic link expiry to 730 hours (~30 days):

1. **Supabase Dashboard** → your project → **Authentication** → **Providers** → **Email**
2. Find **“Email OTP expiration”** or **“Magic link expiration”** (name may vary)
3. Set to `2628000` seconds (730 × 3600). If the dashboard caps the value (e.g. 86400), use the maximum allowed.

Expiry is a project setting; this function does not override it.

