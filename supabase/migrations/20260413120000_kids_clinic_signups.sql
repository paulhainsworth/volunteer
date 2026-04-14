-- 2026 Berkeley Omnium Kids Clinic + Race — public signup (stored for admin review later).

CREATE TABLE IF NOT EXISTS kids_clinic_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  parent_first_name text NOT NULL,
  parent_last_name text NOT NULL,
  parent_email text NOT NULL,
  child_name text NOT NULL,
  child_gender text NOT NULL,
  child_age smallint NOT NULL,
  waiver_version text NOT NULL DEFAULT 'USAC-Base-2024-Rev-5-2024',
  waiver_consent boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_kids_clinic_signups_created_at ON kids_clinic_signups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kids_clinic_signups_parent_email ON kids_clinic_signups (parent_email);

COMMENT ON TABLE kids_clinic_signups IS 'Kids Clinic + Race registrations (2026 Berkeley Omnium); inserted via Edge Function only.';

ALTER TABLE kids_clinic_signups ENABLE ROW LEVEL SECURITY;

-- No GRANT to anon/authenticated: inserts use service role in Edge Function only.
