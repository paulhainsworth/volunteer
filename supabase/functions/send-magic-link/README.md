# send-magic-link

Sends a **magic link** email when a user requests a sign-in link from the login page (`#/auth/login`). Uses the same branded HTML as the revised magic-link template; email is sent via Resend.

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
