-- Complete fix for admin permissions
-- This drops and recreates all profile policies to fix conflicts

-- Step 1: Drop ALL existing policies on profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Step 2: Recreate policies with correct logic

-- Anyone can view profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their OWN profile OR admins can update ANY profile
CREATE POLICY "Users can update own profile or admins can update any"
  ON profiles FOR UPDATE
  USING (
    -- Either you're updating your own profile
    auth.uid() = id 
    OR 
    -- Or you're an admin (can update anyone)
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Step 3: Verify policies were created
SELECT 
  policyname, 
  cmd,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING clause'
  END as using_clause
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

