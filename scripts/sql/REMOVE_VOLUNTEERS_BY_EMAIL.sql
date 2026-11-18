-- Remove specific volunteers by email. Safe, dependency-aware.
-- Run in Supabase SQL Editor.
--
-- What happens when you remove a user:
--   • Signups: DELETED (CASCADE) — they no longer appear as signed up; role slots free up.
--   • Waivers: DELETED (CASCADE).
--   • volunteer_roles.created_by: SET NULL (roles stay; "created by" is blank).
--   • volunteer_leader_domains.leader_id: SET NULL (domain stays; reassign a leader in the app).
--   • emails_sent.sent_by, volunteer_contacts.profile_id: SET NULL (records kept, link removed).
-- So nothing is left pointing to a missing profile; only intentional CASCADE and SET NULL.
--
-- WORKFLOW:
--   1. Edit the email list in both places below (PREVIEW and DELETE block) so they match.
--   2. Run the script once: it only PREVIEWs (no delete).
--   3. If the preview looks correct, uncomment the DELETE block and run the script again.

-- =============================================================================
-- Email list — edit here for PREVIEW. (Keep the same list in the DELETE block.)
-- =============================================================================
WITH email_list AS (
  SELECT unnest(ARRAY[
    'flyer@mailinator.com',
    'marshal@mailinator.com',
    'brent@mailinator.com',
    'doug@mailinator.com',
    'frank@mailinator.com',
    'jimbo@mailinator.com',
    'george@mailinator.com'
  ]) AS email
),
targets AS (
  SELECT p.id, p.email, p.first_name, p.last_name, p.role
  FROM profiles p
  INNER JOIN email_list e ON e.email = p.email
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
-- DELETE block — uncomment and run to actually remove the users.
-- How to uncomment: delete the line that has only "/*" and the line that has only "*/"
-- =============================================================================
/*
DO $$
DECLARE
  target_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id)
  INTO target_ids
  FROM profiles
  WHERE email = ANY(ARRAY[
    'flyer@mailinator.com',
    'marshal@mailinator.com',
    'brent@mailinator.com',
    'doug@mailinator.com',
    'frank@mailinator.com',
    'jimbo@mailinator.com',
    'george@mailinator.com'
  ]::text[]);

  IF target_ids IS NULL OR array_length(target_ids, 1) IS NULL THEN
    RAISE NOTICE 'No matching profiles; nothing deleted.';
    RETURN;
  END IF;

  DELETE FROM profiles WHERE id = ANY(target_ids);
  DELETE FROM auth.users WHERE id = ANY(target_ids);

  RAISE NOTICE 'Removed % user(s).', array_length(target_ids, 1);
END $$;
*/
