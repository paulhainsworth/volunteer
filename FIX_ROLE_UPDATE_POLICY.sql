-- Fix RLS policies for volunteer_roles to allow admins and leaders to update roles
-- This fixes the "hanging" update button issue

-- Drop existing UPDATE policies that might be incomplete
DROP POLICY IF EXISTS "Admins can update volunteer roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins and creators can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Volunteer leaders can update their assigned roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins can update any volunteer role" ON volunteer_roles;

-- Create comprehensive UPDATE policy for admins
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

-- Create UPDATE policy for volunteer leaders
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

-- Verify the policies were created
SELECT 
  policyname,
  cmd,
  permissive,
  CASE 
    WHEN qual IS NOT NULL THEN '✓ USING'
    ELSE '✗ USING' 
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN '✓ WITH CHECK'
    ELSE '✗ WITH CHECK' 
  END as with_check_clause
FROM pg_policies 
WHERE tablename = 'volunteer_roles'
AND cmd = 'UPDATE'
ORDER BY policyname;

SELECT '✅ Role UPDATE RLS policies fixed! You should now be able to update roles.' as status;

