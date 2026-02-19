-- Fix: "Database error creating new user" when adding a volunteer leader
-- Run this in Supabase SQL Editor, then try adding the leader again.
--
-- This script:
-- 1. Drops the profiles.role check constraint (finds it by definition, not by name)
-- 2. Adds the correct constraint allowing 'volunteer_leader'
-- 3. Ensures emergency_contact columns exist (handle_new_user trigger may insert them)

-- Step 1: Drop any existing CHECK on profiles that restricts role
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
    RAISE NOTICE 'Dropped constraint: %', conname;
  END LOOP;
END $$;

-- Step 2: Add the correct role constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

-- Step 3: Ensure columns used by handle_new_user exist (avoid "column does not exist" on trigger)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Verify
SELECT 'Done. Role constraint and columns are ready.' AS status;
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
