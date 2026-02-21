-- =============================================================================
-- STAGING: Apply full schema and migrations in one run
-- Run this ONCE in the staging Supabase project SQL Editor (Phase 1).
-- Generated from the 23-file list in docs/STAGING_ENVIRONMENT_DESIGN_AND_PLAN.md
-- =============================================================================

-- === 1. SUPABASE_SCHEMA.sql ===
-- Race Volunteer Management System - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'volunteer')),
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Volunteer Roles table
CREATE TABLE volunteer_roles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  positions_total INTEGER NOT NULL CHECK (positions_total > 0),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signups table
CREATE TABLE signups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  volunteer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role_id UUID REFERENCES volunteer_roles(id) ON DELETE CASCADE NOT NULL,
  signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  waiver_signed BOOLEAN DEFAULT FALSE,
  UNIQUE(volunteer_id, role_id)
);

-- Waivers table
CREATE TABLE waivers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  volunteer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  agreed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  signature_name TEXT NOT NULL,
  waiver_version INTEGER DEFAULT 1,
  waiver_text TEXT NOT NULL
);

-- Waiver settings table (stores current waiver)
CREATE TABLE waiver_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Only one row allowed
  waiver_text TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email history table
CREATE TABLE emails_sent (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_ids UUID[] NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_volunteer_roles_event_date ON volunteer_roles(event_date);
CREATE INDEX idx_signups_volunteer_id ON signups(volunteer_id);
CREATE INDEX idx_signups_role_id ON signups(role_id);
CREATE INDEX idx_signups_status ON signups(status);
CREATE INDEX idx_waivers_volunteer_id ON waivers(volunteer_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for volunteer_roles
CREATE TRIGGER update_volunteer_roles_updated_at BEFORE UPDATE
  ON volunteer_roles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiver_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Volunteer roles policies (public read, admin write)
CREATE POLICY "Volunteer roles are viewable by everyone"
  ON volunteer_roles FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert volunteer roles"
  ON volunteer_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update volunteer roles"
  ON volunteer_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete volunteer roles"
  ON volunteer_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Signups policies
CREATE POLICY "Signups viewable by admins and own volunteer"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Volunteers can create own signups"
  ON signups FOR INSERT
  WITH CHECK (volunteer_id = auth.uid());

CREATE POLICY "Volunteers can update own signups"
  ON signups FOR UPDATE
  USING (volunteer_id = auth.uid());

CREATE POLICY "Volunteers can delete own signups"
  ON signups FOR DELETE
  USING (volunteer_id = auth.uid());

-- Waivers policies
CREATE POLICY "Waivers viewable by admins and own volunteer"
  ON waivers FOR SELECT
  USING (
    volunteer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Volunteers can create own waivers"
  ON waivers FOR INSERT
  WITH CHECK (volunteer_id = auth.uid());

-- Waiver settings policies
CREATE POLICY "Waiver settings viewable by everyone"
  ON waiver_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update waiver settings"
  ON waiver_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Emails policies (admin only)
CREATE POLICY "Emails viewable by admins"
  ON emails_sent FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can send emails"
  ON emails_sent FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert default waiver text
INSERT INTO waiver_settings (waiver_text, version)
VALUES ('I hereby agree to waive and release any and all claims against the event organizers, volunteers, sponsors, and affiliated organizations. I understand that participating in bicycle racing events involves inherent risks including but not limited to: collisions, falls, equipment failure, and environmental hazards. I assume all risks associated with participation and agree to hold harmless all parties involved in organizing and conducting the event.', 1)
ON CONFLICT (id) DO NOTHING;

-- Function to get dashboard statistics (for admins)
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_positions', COALESCE(SUM(positions_total), 0),
    'filled_positions', COALESCE(COUNT(DISTINCT s.id), 0),
    'total_volunteers', COALESCE(COUNT(DISTINCT s.volunteer_id), 0),
    'total_roles', COALESCE(COUNT(DISTINCT vr.id), 0),
    'upcoming_events', COALESCE(COUNT(DISTINCT vr.id) FILTER (WHERE vr.event_date >= CURRENT_DATE), 0)
  )
  INTO result
  FROM volunteer_roles vr
  LEFT JOIN signups s ON vr.id = s.role_id AND s.status = 'confirmed';
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- === 2. FIX_PROFILE_INSERT_RLS.sql ===
DROP POLICY IF EXISTS "Users can create own profile or admins can create any" ON profiles;
DROP POLICY IF EXISTS "Users, admins, or leaders can create profiles" ON profiles;

CREATE POLICY "Users, admins, or leaders can create profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    (id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'volunteer_leader')
    )
  );


-- === 3. FIX_PROFILES_UPDATED_AT.sql (empty in repo) ===


-- === 4. FIX_UPDATE_POLICY.sql ===
DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON profiles;

CREATE POLICY "Users can update own profile or admins can update any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );


-- === 5. ADD_EMERGENCY_CONTACT.sql ===
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);


-- === 6. FIX_SIGNUP_FK_PROFILE_TRIGGER.sql ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

DO $$
DECLARE conname text;
BEGIN
  FOR conname IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'profiles' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', conname);
  END LOOP;
END $$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

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


-- === 7. ADD_VOLUNTEER_LEADER_ROLE.sql ===
ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_volunteer_roles_leader_id ON volunteer_roles(leader_id);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

DROP POLICY IF EXISTS "Volunteer leaders can view their assigned roles" ON volunteer_roles;
CREATE POLICY "Volunteer leaders can view their assigned roles"
  ON volunteer_roles FOR SELECT
  USING (
    leader_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'volunteer_leader')
    )
  );

DROP POLICY IF EXISTS "Volunteer leaders can update their assigned roles" ON volunteer_roles;
CREATE POLICY "Volunteer leaders can update their assigned roles"
  ON volunteer_roles FOR UPDATE
  USING (
    leader_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Volunteer leaders can view signups for their roles" ON signups;
CREATE POLICY "Volunteer leaders can view signups for their roles"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = role_id
      AND vr.leader_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


-- === 8. FIX_PROFILES_ROLE_CONSTRAINT_FOR_LEADER.sql ===
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));


-- === 9. ADD_LEADER_DOMAINS_SAFE.sql ===
CREATE TABLE IF NOT EXISTS volunteer_leader_domains (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES volunteer_leader_domains(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_volunteer_roles_domain_id ON volunteer_roles(domain_id);
CREATE INDEX IF NOT EXISTS idx_domains_leader_id ON volunteer_leader_domains(leader_id);

ALTER TABLE volunteer_leader_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Domains are viewable by everyone" ON volunteer_leader_domains;
CREATE POLICY "Domains are viewable by everyone"
  ON volunteer_leader_domains FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert domains" ON volunteer_leader_domains;
CREATE POLICY "Admins can insert domains"
  ON volunteer_leader_domains FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update domains" ON volunteer_leader_domains;
CREATE POLICY "Admins can update domains"
  ON volunteer_leader_domains FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete domains" ON volunteer_leader_domains;
CREATE POLICY "Admins can delete domains"
  ON volunteer_leader_domains FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS update_domains_updated_at ON volunteer_leader_domains;
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE
  ON volunteer_leader_domains FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO volunteer_leader_domains (name, description)
VALUES 
  ('Registration & Check-in', 'Handling rider registration, number pickup, and check-in'),
  ('Course Marshals', 'Directing riders and monitoring the race course'),
  ('Water Stations & Aid', 'Providing water, snacks, and support along the course'),
  ('Finish Line & Timing', 'Managing finish line operations and race timing'),
  ('Loading & Logistics', 'Equipment setup, teardown, and transportation'),
  ('Food & Hospitality', 'Post-race food service and volunteer meals'),
  ('Parking & Traffic', 'Directing parking and managing traffic flow'),
  ('Medical & Safety', 'First aid and emergency response support')
ON CONFLICT (name) DO NOTHING;


-- === 10. FIX_SIGNUPS_RLS_DOMAIN_LEADER.sql ===
DROP POLICY IF EXISTS "Volunteer leaders can view signups for their roles" ON signups;

CREATE POLICY "Volunteer leaders can view signups for their roles"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = signups.role_id
      AND vr.leader_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      INNER JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
      AND vld.leader_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


-- === 11. FIX_SIGNUPS_RLS_LEADER_VIEW.sql ===
DROP POLICY IF EXISTS "Signups viewable by admins and own volunteer" ON signups;
DROP POLICY IF EXISTS "Volunteer leaders can view signups for their roles" ON signups;

CREATE POLICY "Signups viewable by volunteer, admin, or role leader"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = signups.role_id
      AND vr.leader_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      INNER JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
      AND vld.leader_id = auth.uid()
    )
  );


-- === 12. FIX_VOLUNTEER_ROLES_UPDATE_RLS.sql ===
DROP POLICY IF EXISTS "Admins can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins and creators can update roles" ON volunteer_roles;

CREATE POLICY "Admins can update roles"
  ON volunteer_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


-- === 13. FIX_ROLE_UPDATE_POLICY.sql ===
DROP POLICY IF EXISTS "Admins can update volunteer roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins and creators can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Volunteer leaders can update their assigned roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins can update any volunteer role" ON volunteer_roles;

CREATE POLICY "Admins can update any volunteer role"
  ON volunteer_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Volunteer leaders can update their assigned roles"
  ON volunteer_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'volunteer_leader'
    )
    AND (
      leader_id = auth.uid() 
      OR domain_id IN (
        SELECT id FROM volunteer_leader_domains 
        WHERE leader_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'volunteer_leader'
    )
    AND (
      leader_id = auth.uid() 
      OR domain_id IN (
        SELECT id FROM volunteer_leader_domains 
        WHERE leader_id = auth.uid()
      )
    )
  );


-- === 14. FIX_ADMIN_UPDATE_ROLES.sql ===
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


-- === 15. FIX_ADMIN_SIGNUP_RLS.sql ===
DROP POLICY IF EXISTS "Users can create their own signups" ON signups;
DROP POLICY IF EXISTS "Volunteers can sign up for roles" ON signups;
DROP POLICY IF EXISTS "Users can create signups or admins can create for anyone" ON signups;
DROP POLICY IF EXISTS "Users, admins, or leaders can create signups" ON signups;
DROP POLICY IF EXISTS "Users, admins, or leaders can delete signups" ON signups;

CREATE POLICY "Users, admins, or leaders can create signups"
  ON signups FOR INSERT
  WITH CHECK (
    (volunteer_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1
      FROM volunteer_roles vr
      LEFT JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
        AND (
          vr.leader_id = auth.uid()
          OR vld.leader_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users, admins, or leaders can delete signups"
  ON signups FOR DELETE
  USING (
    volunteer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM volunteer_roles vr
      LEFT JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
        AND (
          vr.leader_id = auth.uid()
          OR vld.leader_id = auth.uid()
        )
    )
  );


-- === 16. ADD_FEATURED_ROLES.sql (content restored; file on disk was truncated) ===
ALTER TABLE volunteer_roles
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN volunteer_roles.featured IS 'When true, role is shown in the six featured role boxes on the homepage (admin-controlled).';


-- === 17. ADD_TEAM_CLUB_AFFILIATION.sql ===
CREATE TABLE IF NOT EXISTS public.team_club_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 999
);

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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_club_affiliation_id UUID REFERENCES public.team_club_affiliations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_club_affiliation_id ON public.profiles(team_club_affiliation_id);

ALTER TABLE public.team_club_affiliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team/club affiliations are viewable by everyone" ON public.team_club_affiliations;
CREATE POLICY "Team/club affiliations are viewable by everyone"
  ON public.team_club_affiliations FOR SELECT
  USING (true);

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


-- === 18. ADD_PUBLIC_SIGNUP_COUNTS_RLS.sql ===
CREATE OR REPLACE FUNCTION public.get_confirmed_signup_counts(role_ids uuid[])
RETURNS TABLE(role_id uuid, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.role_id, COUNT(*)::bigint
  FROM signups s
  WHERE s.status = 'confirmed'
    AND s.role_id = ANY(role_ids)
  GROUP BY s.role_id;
$$;

COMMENT ON FUNCTION public.get_confirmed_signup_counts(uuid[]) IS
  'Returns confirmed signup count per role. Callable by anon/authenticated so public volunteer page can show correct fill counts without reading signups table.';

GRANT EXECUTE ON FUNCTION public.get_confirmed_signup_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_confirmed_signup_counts(uuid[]) TO authenticated;


-- === 19. scripts/ADD_OMNIUM2026_ROLE_COLUMNS.sql ===
ALTER TABLE volunteer_roles
  ADD COLUMN IF NOT EXISTS estimate_duration_hours NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS event TEXT;

ALTER TABLE volunteer_roles ALTER COLUMN event_date DROP NOT NULL;
ALTER TABLE volunteer_roles ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE volunteer_roles ALTER COLUMN end_time DROP NOT NULL;

ALTER TABLE volunteer_roles ALTER COLUMN positions_total SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_volunteer_roles_event ON volunteer_roles(event);


-- === 20. scripts/ADD_VOLUNTEER_CONTACTS.sql ===
CREATE TABLE IF NOT EXISTS volunteer_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_contacts_email ON volunteer_contacts(email);
CREATE INDEX IF NOT EXISTS idx_volunteer_contacts_profile_id ON volunteer_contacts(profile_id);

ALTER TABLE volunteer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and leaders can read volunteer_contacts" ON volunteer_contacts;
CREATE POLICY "Admins and leaders can read volunteer_contacts"
  ON volunteer_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'volunteer_leader')
    )
  );

DROP POLICY IF EXISTS "Admins can insert volunteer_contacts" ON volunteer_contacts;
CREATE POLICY "Admins can insert volunteer_contacts"
  ON volunteer_contacts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update volunteer_contacts" ON volunteer_contacts;
CREATE POLICY "Admins can update volunteer_contacts"
  ON volunteer_contacts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete volunteer_contacts" ON volunteer_contacts;
CREATE POLICY "Admins can delete volunteer_contacts"
  ON volunteer_contacts FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE volunteer_contacts
  SET profile_id = NEW.id
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND profile_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_volunteer_contact_trigger ON profiles;
CREATE TRIGGER link_volunteer_contact_trigger
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_volunteer_contact_on_profile_insert();

CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS DISTINCT FROM NEW.email OR OLD.email IS NULL) THEN
    UPDATE volunteer_contacts
    SET profile_id = NEW.id
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
      AND profile_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_volunteer_contact_update_trigger ON profiles;
CREATE TRIGGER link_volunteer_contact_update_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_volunteer_contact_on_profile_update();


-- === 21. FIX_CREATE_LEADER_LINK_TRIGGER.sql ===
CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE volunteer_contacts
  SET profile_id = NEW.id
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND profile_id IS NULL;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS DISTINCT FROM NEW.email OR OLD.email IS NULL) THEN
    UPDATE volunteer_contacts
    SET profile_id = NEW.id
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
      AND profile_id IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- === 22. FIX_CREATE_LEADER_DB_ERROR.sql ===
DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', conname);
  END LOOP;
END $$;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;


-- === 23. FIX_RLS_COMPLETE.sql ===
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile or admins can update any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- =============================================================================
-- Done. Staging schema applied.
-- =============================================================================
SELECT 'Staging full schema applied successfully.' AS status;
