-- Add Volunteer Leader Role Feature
-- Run this in Supabase SQL Editor

-- Step 1: Add leader_id column to volunteer_roles table
ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Step 2: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_volunteer_roles_leader_id ON volunteer_roles(leader_id);

-- Step 3: Update the role check constraint to include volunteer_leader
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'volunteer', 'volunteer_leader'));

-- Step 4: Add RLS policy for volunteer leaders to view their assigned roles
CREATE POLICY "Volunteer leaders can view their assigned roles"
  ON volunteer_roles FOR SELECT
  USING (
    leader_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'volunteer_leader')
    )
  );

-- Step 5: Add RLS policy for volunteer leaders to update their assigned roles
CREATE POLICY "Volunteer leaders can update their assigned roles"
  ON volunteer_roles FOR UPDATE
  USING (
    leader_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Step 6: Allow volunteer leaders to view signups for their roles
CREATE POLICY "Volunteer leaders can view signups for their roles"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = role_id
      AND vr.leader_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Verification queries
SELECT 'Volunteer Leader setup complete!' as status;

-- Show current role distribution
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

