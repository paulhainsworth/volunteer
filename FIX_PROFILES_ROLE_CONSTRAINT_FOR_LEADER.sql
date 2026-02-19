-- Fix: "Database error creating new user" when adding a volunteer leader
-- Cause: handle_new_user trigger inserts into profiles with role from user_metadata.
-- create-leader sends role = 'volunteer_leader'; if profiles.role only allows
-- 'admin' and 'volunteer', the INSERT fails and Auth returns this error.
-- Run this in Supabase SQL Editor.

-- Drop the existing role check and allow volunteer_leader
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));
