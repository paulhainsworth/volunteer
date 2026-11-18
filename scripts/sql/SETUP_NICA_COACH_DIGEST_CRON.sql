-- Schedule send-nica-coach-digest (same pattern as SETUP_DAILY_ADMIN_SUMMARY_CRON.sql).
--
-- IMPORTANT: Many Supabase projects do NOT have the PostgreSQL "vault" extension
-- (Dashboard may show an error: extension "vault" is not available). If so, do not
-- use Vault in SQL — use GitHub Actions instead: see .github/workflows/nica-coach-digest-cron.yml
--
-- Prerequisites (only if pg_cron + pg_net + vault work on your project):
-- 1. Extensions pg_cron and pg_net enabled (and vault, if you store secrets there).
-- 2. Vault secrets used by the admin summary job — same names:
--      daily_admin_summary_project_url   → https://YOUR_PROJECT_REF.supabase.co
--      daily_admin_summary_service_role_key → your service_role JWT
--    If you never ran SETUP_DAILY_ADMIN_SUMMARY_CRON.sql, run that first (or create
--    those two secrets manually in Dashboard → Project Settings → Vault).
-- 3. Edge function send-nica-coach-digest deployed.
--
-- This job runs every 15 minutes. The function only sends email during the 8am Pacific hour.
--
-- To apply: Supabase Dashboard → SQL Editor → paste → Run.

select
  cron.schedule(
    'nica-coach-digest-email',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_admin_summary_project_url') || '/functions/v1/send-nica-coach-digest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_admin_summary_service_role_key')
        ),
        body := jsonb_build_object('source', 'cron'),
        timeout_milliseconds := 60000
      ) as request_id;
    $$
  );

-- If you need to remove this job later:
-- select cron.unschedule('nica-coach-digest-email');
