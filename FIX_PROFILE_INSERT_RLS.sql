-- Fix RLS policy to allow profile creation
-- This allows both the trigger, admins, and volunteer leaders to create profiles

-- Drop existing INSERT policy for profiles
DROP POLICY IF EXISTS "Users can create own profile or admins can create any" ON profiles;
DROP POLICY IF EXISTS "Users, admins, or leaders can create profiles" ON profiles;

-- Create new INSERT policy that allows:
-- 1. Users to create their own profile (for the trigger)
-- 2. Admins or volunteer leaders to create profiles
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
WHERE tablename = 'profiles'
AND cmd = 'INSERT'
ORDER BY policyname;

SELECT '✅ Profile INSERT RLS policy updated! Admins and leaders can now create volunteers.' as status;

