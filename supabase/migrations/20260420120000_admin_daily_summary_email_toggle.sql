-- Email digest toggles (NICA coach digest + admin daily summary). Idempotent: safe to run
-- if `email_digest_settings` never existed (e.g. only this file was applied remotely).

CREATE TABLE IF NOT EXISTS public.email_digest_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nica_coach_daily_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_digest_settings
  ADD COLUMN IF NOT EXISTS admin_daily_volunteer_summary_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON TABLE public.email_digest_settings IS 'Admin toggles for scheduled digest emails (single row, id = 1).';
COMMENT ON COLUMN public.email_digest_settings.nica_coach_daily_digest_enabled IS 'When false, send-nica-coach-digest sends no email (cron still invokes the function).';
COMMENT ON COLUMN public.email_digest_settings.admin_daily_volunteer_summary_enabled IS
  'When false, send-daily-admin-summary sends no admin email and does not post Slack; cron may still invoke the function.';

INSERT INTO public.email_digest_settings (id, nica_coach_daily_digest_enabled, admin_daily_volunteer_summary_enabled)
VALUES (1, true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.email_digest_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select email_digest_settings" ON public.email_digest_settings;
CREATE POLICY "Admins select email_digest_settings"
  ON public.email_digest_settings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins update email_digest_settings" ON public.email_digest_settings;
CREATE POLICY "Admins update email_digest_settings"
  ON public.email_digest_settings FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.set_email_digest_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_digest_settings_updated_at ON public.email_digest_settings;
CREATE TRIGGER trg_email_digest_settings_updated_at
  BEFORE UPDATE ON public.email_digest_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_email_digest_settings_updated_at();
