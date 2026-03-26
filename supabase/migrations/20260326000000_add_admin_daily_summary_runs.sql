-- Track daily admin summary sends so the cron job can run frequently
-- while the function sends at most once per Pacific day.

CREATE TABLE IF NOT EXISTS admin_daily_summary_runs (
  summary_date date PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'sent', 'failed')),
  run_started_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  run_source text,
  metrics jsonb,
  error text
);

COMMENT ON TABLE admin_daily_summary_runs IS 'Tracks daily admin summary email runs to prevent duplicate sends.';
COMMENT ON COLUMN admin_daily_summary_runs.summary_date IS 'Pacific-date summary period being emailed (the "yesterday" date in the email).';
COMMENT ON COLUMN admin_daily_summary_runs.run_source IS 'Where the run came from, e.g. cron or manual.';
COMMENT ON COLUMN admin_daily_summary_runs.metrics IS 'Summary counts and metadata captured when the email run completed.';
