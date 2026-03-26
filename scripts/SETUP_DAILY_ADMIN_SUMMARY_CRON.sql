-- Set up the daily admin summary email cron job in Supabase.
--
-- What this does:
-- 1. Stores your project URL and service role key in Vault
-- 2. Schedules the send-daily-admin-summary edge function every 15 minutes
--
-- Why every 15 minutes?
-- Supabase cron runs in UTC. The edge function itself only sends during the
-- 8am Pacific hour and uses admin_daily_summary_runs to ensure it sends once.
-- This avoids DST problems while still delivering around 8am PT year-round.
--
-- Before running:
-- - Deploy the send-daily-admin-summary edge function
-- - Replace the placeholders below with your current project values

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- Replace these placeholder values before running.
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'daily_admin_summary_project_url');
select vault.create_secret('YOUR_SUPABASE_SERVICE_ROLE_KEY', 'daily_admin_summary_service_role_key');

select
  cron.schedule(
    'daily-admin-summary-email',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_admin_summary_project_url') || '/functions/v1/send-daily-admin-summary',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_admin_summary_service_role_key')
        ),
        body := jsonb_build_object('source', 'cron'),
        timeout_milliseconds := 10000
      ) as request_id;
    $$
  );

-- To stop the job later:
-- select cron.unschedule('daily-admin-summary-email');
