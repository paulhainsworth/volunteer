-- Fix: Volunteer leader dashboard shows 0/N filled and "No volunteers yet" even when
-- signups exist. RLS on signups must allow leaders to SELECT signups for roles they
-- lead (direct leader_id or domain leader).
-- Run in Supabase SQL Editor.

-- Drop all existing SELECT policies on signups so we have one clear policy
DROP POLICY IF EXISTS "Signups viewable by admins and own volunteer" ON signups;
DROP POLICY IF EXISTS "Volunteer leaders can view signups for their roles" ON signups;

-- Single SELECT policy: volunteer (own), admin (all), or leader (roles they lead)
CREATE POLICY "Signups viewable by volunteer, admin, or role leader"
  ON signups FOR SELECT
  USING (
    volunteer_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    -- Direct leader of this role
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      WHERE vr.id = signups.role_id
      AND vr.leader_id = auth.uid()
    )
    OR
    -- Domain leader for this role (role in a domain they lead)
    EXISTS (
      SELECT 1 FROM volunteer_roles vr
      INNER JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
      AND vld.leader_id = auth.uid()
    )
  );

-- Verify
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'signups'
AND cmd = 'SELECT'
ORDER BY policyname;
