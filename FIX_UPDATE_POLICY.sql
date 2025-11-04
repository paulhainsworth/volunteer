-- Fix UPDATE policy to include WITH CHECK clause
-- The USING clause determines WHO can initiate the update
-- The WITH CHECK clause determines what values they can set

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON profiles;

-- Recreate with both USING and WITH CHECK
CREATE POLICY "Users can update own profile or admins can update any"
  ON profiles FOR UPDATE
  USING (
    -- Can update if: updating own profile OR user is admin
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    -- Same check for the new values
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Verify
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'profiles' 
AND cmd = 'UPDATE';

