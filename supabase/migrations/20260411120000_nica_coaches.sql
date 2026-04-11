-- NICA coach contacts: receive daily digest email with team volunteer PDF + summary.
-- Coaches do not require login; rows are admin-managed PII + email + end date.

CREATE TABLE IF NOT EXISTS public.nica_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  team_club_affiliation_id UUID NOT NULL REFERENCES public.team_club_affiliations (id) ON DELETE CASCADE,
  email_end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT nica_coaches_email_nonempty CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS nica_coaches_email_affiliation_lower_idx
  ON public.nica_coaches (lower(trim(email)), team_club_affiliation_id);

CREATE INDEX IF NOT EXISTS nica_coaches_affiliation_id_idx ON public.nica_coaches (team_club_affiliation_id);
CREATE INDEX IF NOT EXISTS nica_coaches_email_end_date_idx ON public.nica_coaches (email_end_date);

COMMENT ON TABLE public.nica_coaches IS 'NICA team coaches receiving daily volunteer digest emails until email_end_date (Pacific), inclusive.';
COMMENT ON COLUMN public.nica_coaches.email_end_date IS 'Last calendar day (Pacific) to send the daily email; no email after this date.';

-- One successful digest per coach per Pacific calendar day (idempotency for 8am cron).
CREATE TABLE IF NOT EXISTS public.nica_coach_digest_runs (
  coach_id UUID NOT NULL REFERENCES public.nica_coaches (id) ON DELETE CASCADE,
  pacific_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, pacific_date)
);

CREATE INDEX IF NOT EXISTS nica_coach_digest_runs_pacific_date_idx ON public.nica_coach_digest_runs (pacific_date);

ALTER TABLE public.nica_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nica_coach_digest_runs ENABLE ROW LEVEL SECURITY;

-- nica_coach_digest_runs: RLS enabled, no policies — only service_role (edge function) can write; clients cannot access.

DROP POLICY IF EXISTS "Admins select nica_coaches" ON public.nica_coaches;
CREATE POLICY "Admins select nica_coaches"
  ON public.nica_coaches FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins insert nica_coaches" ON public.nica_coaches;
CREATE POLICY "Admins insert nica_coaches"
  ON public.nica_coaches FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins update nica_coaches" ON public.nica_coaches;
CREATE POLICY "Admins update nica_coaches"
  ON public.nica_coaches FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins delete nica_coaches" ON public.nica_coaches;
CREATE POLICY "Admins delete nica_coaches"
  ON public.nica_coaches FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.set_nica_coaches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nica_coaches_updated_at ON public.nica_coaches;
CREATE TRIGGER trg_nica_coaches_updated_at
  BEFORE UPDATE ON public.nica_coaches
  FOR EACH ROW EXECUTE FUNCTION public.set_nica_coaches_updated_at();
