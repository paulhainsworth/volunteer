# send-nica-coach-digest

Sends a daily email to each active [NICA coach](https://www.berkeleyomnium.com/#/admin/volunteers) (rows in `public.nica_coaches` with `email_end_date >= today` in Pacific).

- **When:** Intended to run at **8:00 a.m. Pacific** once per calendar day.
- **Auth:** Call with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (same pattern as `send-daily-admin-summary`).
- **Idempotency:** Inserts into `nica_coach_digest_runs` per `(coach_id, pacific_date)` so re-invocations the same day do not duplicate sends.
- **Payload:** `POST` body `{ "force": true }` skips the 8am Pacific hour check (for manual testing). `{ "force": true }` also re-sends even if a row already exists for today (still useful only with care).

## Deploy

```bash
supabase secrets set RESEND_API_KEY=...
supabase functions deploy send-nica-coach-digest --no-verify-jwt
```

Requires `RESEND_API_KEY` and existing Resend domain setup (same as other notification functions).

## Schedule (8am PDT)

Use Supabase [scheduled triggers](https://supabase.com/docs/guides/functions/schedule-functions), GitHub Actions, or another cron that `POST`s this function’s URL with the service role JWT once per hour (the function no-ops outside the 8am Pacific hour unless `force` is true).

Example curl (replace project ref and key):

```bash
curl -sS -X POST \
  'https://<PROJECT_REF>.supabase.co/functions/v1/send-nica-coach-digest' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Database

Apply migration `20260411120000_nica_coaches.sql` (creates `nica_coaches` and `nica_coach_digest_runs`).
