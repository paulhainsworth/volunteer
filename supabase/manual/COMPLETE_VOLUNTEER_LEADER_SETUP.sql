-- Complete Volunteer Leader Setup
-- Run this ONCE to enable volunteer leader functionality
-- This combines all necessary changes in the correct order

-- ============================================
-- STEP 1: Update role constraint
-- ============================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

-- ============================================
-- STEP 2: Add leader_id column to roles
-- ============================================
ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================
-- STEP 3: Create index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_volunteer_roles_leader_id ON volunteer_roles(leader_id);

-- ============================================
-- STEP 4: Fix UPDATE policy for profiles
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON profiles;

CREATE POLICY "Users can update own profile or admins can update any"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- ============================================
-- STEP 5: Add RLS policies for volunteer leaders
-- ============================================

-- Volunteer leaders can view their assigned roles
DROP POLICY IF EXISTS "Volunteer leaders can view their assigned roles" ON volunteer_roles;
CREATE POLICY "Volunteer leaders can view their assigned roles"
  ON volunteer_roles FOR SELECT
  USING (
    true  -- Everyone can view all roles (existing behavior)
  );

-- Volunteer leaders can view signups for their roles
DROP POLICY IF EXISTS "Volunteer leaders can view signups for their roles" ON signups;
CREATE POLICY "Volunteer leaders can view signups for their roles"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid() 
    OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = role_id
      AND vr.leader_id = auth.uid()
    ) 
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Volunteer Leader setup complete!' as status;

-- Show current role distribution
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- Show policies on profiles
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

