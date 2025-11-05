-- Fix RLS policies to allow admins to create signups on behalf of volunteers
-- This allows admins to assign volunteers to roles from the Users page

-- Drop existing INSERT policy for signups
DROP POLICY IF EXISTS "Users can create their own signups" ON signups;
DROP POLICY IF EXISTS "Volunteers can sign up for roles" ON signups;

-- Create new INSERT policy that allows both:
-- 1. Users to sign up themselves
-- 2. Admins to sign up anyone
CREATE POLICY "Users can create signups or admins can create for anyone"
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
  );

-- Verify the policy was created
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
AND cmd = 'INSERT'
ORDER BY policyname;

SELECT '✅ Admin can now assign volunteers to roles!' as status;

