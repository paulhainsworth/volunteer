INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000001', 'volunteer@example.invalid');
GRANT UPDATE ON profiles TO authenticated;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
UPDATE profiles SET first_name = 'Updated' WHERE id = auth.uid();
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM profiles WHERE id = auth.uid() AND first_name = 'Updated') THEN
    RAISE EXCEPTION 'Own-profile edit did not persist';
  END IF;
END
$$;
ROLLBACK;


-- Verify normal account provisioning and role-management permissions.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000004', 'admin-fixture@example.invalid');
UPDATE profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-000000000004';
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF EXISTS (SELECT id FROM profiles) THEN
    RAISE EXCEPTION 'Anonymous profile reads must return no rows';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_volunteer_profile_role(auth.uid(), 'volunteer_leader');
    RAISE EXCEPTION 'The role operation must require an administrator';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
SELECT public.set_volunteer_profile_role('00000000-0000-4000-8000-000000000001', 'volunteer_leader');
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM profiles WHERE
    id = '00000000-0000-4000-8000-000000000001' AND role = 'volunteer_leader') THEN
    RAISE EXCEPTION 'Authorized role assignment did not persist';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000005', 'leader-profile@example.invalid'),
  ('00000000-0000-4000-8000-000000000006', 'other-profile@example.invalid');
UPDATE profiles SET role = 'volunteer_leader'
WHERE id = '00000000-0000-4000-8000-000000000005';
INSERT INTO volunteer_roles (id, name, positions_total, leader_id)
VALUES ('00000000-0000-4000-8000-000000000007', 'Profile visibility fixture', 2,
  '00000000-0000-4000-8000-000000000005');
INSERT INTO signups (volunteer_id, role_id) VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000007');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT array_agg(id::text ORDER BY id) FROM profiles) IS DISTINCT FROM ARRAY[
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005'
  ] THEN
    RAISE EXCEPTION 'Volunteers should see only their own profile and their assigned leader';
  END IF;
END
$$;
ROLLBACK;
