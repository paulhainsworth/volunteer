-- Fix: Allow admins to update user roles
-- Run this in Supabase SQL Editor

-- Add policy for admins to update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Verify policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

