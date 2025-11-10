-- Fix RLS policies to allow admins or leaders to create signups on behalf of volunteers
-- This allows admins to assign volunteers to roles from the Users page and leaders to do the same

-- Drop existing INSERT policy for signups if present
DROP POLICY IF EXISTS "Users can create their own signups" ON signups;
DROP POLICY IF EXISTS "Volunteers can sign up for roles" ON signups;
DROP POLICY IF EXISTS "Users can create signups or admins can create for anyone" ON signups;
DROP POLICY IF EXISTS "Users, admins, or leaders can create signups" ON signups;
DROP POLICY IF EXISTS "Users, admins, or leaders can delete signups" ON signups;

-- Create new INSERT policy that allows:
-- 1. Users to sign up themselves
-- 2. Admins to sign up anyone
-- 3. Volunteer leaders to sign up anyone for roles they lead (directly or via domain)
CREATE POLICY "Users, admins, or leaders can create signups"
  ON signups FOR INSERT
  WITH CHECK (
    -- User signing up themselves
    (volunteer_id = auth.uid())
    OR
    -- Admin signing up anyone
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    -- Volunteer leader signing up for their role or domain
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

-- Allow admins and leaders to delete signups
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

-- Verify the policies were created
SELECT 
  policyname,
  cmd,
  permissive,
  CASE 
    WHEN with_check IS NOT NULL THEN '✓ WITH CHECK'
    ELSE '✗ WITH CHECK' 
  END as with_check_clause
FROM pg_policies 
WHERE tablename = 'signups'
AND cmd IN ('INSERT', 'DELETE')
ORDER BY policyname;

SELECT '✅ Admins and leaders can now assign volunteers to roles and remove them!' as status;

