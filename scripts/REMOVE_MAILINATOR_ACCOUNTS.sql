-- Remove all profiles (and auth users) whose email contains "mailinator".
-- Run in Supabase SQL Editor.
--
-- Same dependency behavior as other profile removals:
--   Signups, waivers: CASCADE. Roles/domains: created_by/leader_id SET NULL.
--
-- WORKFLOW:
--   1. Run once: PREVIEW only (lists matching accounts and impact).
--   2. If correct, uncomment the DELETE block and run again to remove.

-- =============================================================================
-- PREVIEW: profiles with "mailinator" in email
-- =============================================================================
WITH targets AS (
  SELECT p.id, p.email, p.first_name, p.last_name, p.role
  FROM profiles p
  WHERE p.email ILIKE '%mailinator%'
),
preview AS (
  SELECT
    t.email,
    t.first_name,
    t.last_name,
    t.role,
    (SELECT COUNT(*) FROM signups s WHERE s.volunteer_id = t.id AND s.status = 'confirmed') AS confirmed_signups,
    (SELECT COUNT(*) FROM volunteer_leader_domains d WHERE d.leader_id = t.id) AS domains_led,
    (SELECT COUNT(*) FROM volunteer_roles r WHERE r.created_by = t.id) AS roles_created
  FROM targets t
)
SELECT * FROM preview ORDER BY email;


-- =============================================================================
-- DELETE — uncomment to run (remove the "/*" and "*/" lines)
-- =============================================================================
/*
DO $$
DECLARE
  target_ids UUID[];
  n INT;
BEGIN
  SELECT ARRAY_AGG(id)
  INTO target_ids
  FROM profiles
  WHERE email ILIKE '%mailinator%';

  IF target_ids IS NULL OR array_length(target_ids, 1) IS NULL THEN
    RAISE NOTICE 'No matching profiles; nothing deleted.';
    RETURN;
  END IF;

  n := array_length(target_ids, 1);

  DELETE FROM profiles WHERE id = ANY(target_ids);
  DELETE FROM auth.users WHERE id = ANY(target_ids);

  RAISE NOTICE 'Removed % user(s) with mailinator in email.', n;
END $$;
*/
