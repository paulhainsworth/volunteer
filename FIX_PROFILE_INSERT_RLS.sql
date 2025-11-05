-- Fix RLS policy to allow profile creation
-- This allows both the trigger and admins to create profiles

-- Drop existing INSERT policy for profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;

-- Create new INSERT policy that allows:
-- 1. Users to create their own profile (for the trigger)
-- 2. Admins to create any profile
CREATE POLICY "Users can create own profile or admins can create any"
  ON profiles FOR INSERT
  WITH CHECK (
    -- User creating their own profile (from trigger or signup)
    (id = auth.uid())
    OR
    -- Admin creating any profile
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
WHERE tablename = 'profiles'
AND cmd = 'INSERT'
ORDER BY policyname;

SELECT '✅ Profile INSERT RLS policy fixed! Admins can now create volunteers.' as status;

