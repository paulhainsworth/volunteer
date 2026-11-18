-- Fix RLS policies for volunteer_roles to allow admins to update domain assignments
-- This allows admins to assign/unassign roles to domains

-- Drop existing UPDATE policy if it exists
DROP POLICY IF EXISTS "Admins can update roles" ON volunteer_roles;
DROP POLICY IF EXISTS "Admins and creators can update roles" ON volunteer_roles;

-- Create new UPDATE policy that allows admins to update any role
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

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'volunteer_roles'
AND cmd = 'UPDATE'
ORDER BY policyname;

-- Test query (should return count of roles if admin is logged in)
SELECT COUNT(*) as total_roles FROM volunteer_roles;

