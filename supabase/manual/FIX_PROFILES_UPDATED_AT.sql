-- Fix: record "new" has no field "updated_at"
-- The profiles table is missing updated_at. A trigger (e.g. update_updated_at_column)
-- expects it. Add the column so INSERT/UPDATE on profiles succeed.
--
-- Run this in the Supabase SQL Editor.

-- 1. Add column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Ensure the trigger function exists (may already exist from SUPABASE_SCHEMA / ADD_LEADER_DOMAINS)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Add trigger on profiles for BEFORE UPDATE
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
