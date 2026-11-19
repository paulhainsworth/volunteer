BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000048', 'emergency-leader@example.invalid'),
  ('00000000-0000-4000-8000-000000000049', 'emergency-volunteer@example.invalid');
UPDATE profiles SET role = 'volunteer_leader'
  WHERE id = '00000000-0000-4000-8000-000000000048';
UPDATE profiles SET emergency_contact_name = 'Fixture Emergency Contact'
  WHERE id = '00000000-0000-4000-8000-000000000049';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  target uuid := '00000000-0000-4000-8000-000000000049';
  admin_id uuid := '00000000-0000-4000-8000-000000000004';
  leader_id uuid := '00000000-0000-4000-8000-000000000048';
  volunteer_id uuid := '00000000-0000-4000-8000-000000000001';
  viewer uuid;
  contact_name text;
BEGIN
  IF has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    OR has_column_privilege('authenticated', 'public.profiles', 'emergency_contact_name', 'SELECT')
    OR has_column_privilege('authenticated', 'public.profiles', 'emergency_contact_phone', 'SELECT')
    OR has_column_privilege('authenticated', 'public.profiles', 'emergency_contact_relationship', 'SELECT')
    OR has_column_privilege('anon', 'public.profiles', 'emergency_contact_name', 'SELECT')
    OR has_function_privilege('anon', 'public.get_volunteer_emergency_contacts(uuid[])', 'EXECUTE')
    OR has_function_privilege('anon', 'public.get_own_volunteer_profile()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Emergency-contact details require an authorized read operation';
  END IF;

  FOREACH viewer IN ARRAY ARRAY[admin_id, leader_id, target] LOOP
    PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
    SELECT emergency_contact_name INTO contact_name
      FROM public.get_volunteer_emergency_contacts(ARRAY[target]);
    IF contact_name IS DISTINCT FROM 'Fixture Emergency Contact' THEN
      RAISE EXCEPTION 'Authorized emergency-contact read is missing';
    END IF;
  END LOOP;

  UPDATE public.profiles
    SET emergency_contact_name = 'Updated Fixture Contact'
    WHERE id = target;
  SELECT emergency_contact_name INTO contact_name
    FROM public.get_own_volunteer_profile();
  IF contact_name IS DISTINCT FROM 'Updated Fixture Contact' THEN
    RAISE EXCEPTION 'Volunteer must be able to edit and read their own emergency contact';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', volunteer_id::text, true);
  IF EXISTS (SELECT FROM public.get_volunteer_emergency_contacts(ARRAY[target])) THEN
    RAISE EXCEPTION 'Other volunteers must not see emergency-contact details';
  END IF;
END
$$;

ROLLBACK;
