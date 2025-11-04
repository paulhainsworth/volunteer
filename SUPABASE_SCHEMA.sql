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

