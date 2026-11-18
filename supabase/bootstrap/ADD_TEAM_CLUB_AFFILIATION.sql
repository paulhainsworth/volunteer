-- Team/Club affiliation for volunteers (dropdown in PII, leader add, admin add).
-- Run in Supabase SQL Editor. You can add more rows to team_club_affiliations later.

-- 1. Lookup table (add more via Table Editor or SQL as needed)
CREATE TABLE IF NOT EXISTS public.team_club_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 999
);

-- 2. Seed: Berkeley Bicycle Club first (1), Cal Cycling second (2), rest alphabetically (3+)
INSERT INTO public.team_club_affiliations (name, sort_order) VALUES
  ('Berkeley Bicycle Club', 1),
  ('Cal Cycling', 2),
  ('Albany High School Mountain Bike Team', 3),
  ('Berkeley Mountain Bike Association', 4),
  ('El Cerrito High School', 5),
  ('Kai Velo Racing', 6),
  ('Monarch Racing Development', 7),
  ('N/A', 8),
  ('Oakland Composite', 9),
  ('Oakland Technical High School MTB', 10),
  ('Revolution Racing', 11),
  ('Skyline High School Mountain Bike Team', 12),
  ('Super Sprinkles', 13)
ON CONFLICT (name) DO NOTHING;

-- 3. Profile column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_club_affiliation_id UUID REFERENCES public.team_club_affiliations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_club_affiliation_id ON public.profiles(team_club_affiliation_id);

-- 4. RLS: anyone can read (for dropdowns)
ALTER TABLE public.team_club_affiliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team/club affiliations are viewable by everyone" ON public.team_club_affiliations;
CREATE POLICY "Team/club affiliations are viewable by everyone"
  ON public.team_club_affiliations FOR SELECT
  USING (true);

-- 5. Trigger: include team_club_affiliation_id from auth metadata
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    role,
    first_name,
    last_name,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    team_club_affiliation_id,
    created_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'volunteer'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'emergency_contact_name', '')), ''),
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'emergency_contact_phone', '')), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'team_club_affiliation_id'), '')::uuid,
    now()
  );
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    RETURN new;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT 'Team/club affiliation table and profile column added. Trigger updated.' AS status;
