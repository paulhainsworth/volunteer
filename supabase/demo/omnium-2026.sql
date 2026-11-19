-- Synthetic 2026 Berkeley Omnium fixtures. Run through scripts/seed-omnium-demo.sh.
-- Stable IDs and email addresses allow repeat runs without overwriting edits to demo shifts.
ALTER TABLE public.volunteer_roles ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE TEMP TABLE demo_people (
  synthetic_id uuid, email text, first_name text, last_name text, app_role text, team text
);
INSERT INTO demo_people VALUES
  ('02600000-0000-4000-8000-000000000001', 'admin@volunteer.test', 'Avery', 'Demo', 'admin', 'Berkeley'),
  ('02600000-0000-4000-8000-000000000002', 'leader@volunteer.test', 'Jordan', 'Demo', 'volunteer_leader', 'Berkeley'),
  ('02600000-0000-4000-8000-000000000003', 'volunteer@volunteer.test', 'Riley', 'Demo', 'volunteer', 'Albany'),
  ('02600000-0000-4000-8000-000000000004', 'crew@volunteer.test', 'Casey', 'Demo', 'volunteer', 'Oakland Composite'),
  ('02600000-0000-4000-8000-000000000005', 'junior@volunteer.test', 'Morgan', 'Demo', 'volunteer', 'Skyline'),
  ('02600000-0000-4000-8000-000000000006', 'new@volunteer.test', 'Sam', 'Demo', 'volunteer', 'El Cerrito'),
  ('02600000-0000-4000-8000-000000000007', 'checkin@volunteer.test', 'Alex', 'Demo', 'volunteer', 'Oakland Technical');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, email_change, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT '00000000-0000-0000-0000-000000000000', synthetic_id, 'authenticated', 'authenticated', email,
  now(), '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  jsonb_build_object('first_name', first_name, 'last_name', last_name), now(), now()
FROM demo_people p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = p.email)
ON CONFLICT DO NOTHING;

CREATE TEMP VIEW demo_accounts AS
SELECT u.id, p.email, p.first_name, p.last_name, p.app_role, p.team
FROM demo_people p JOIN auth.users u ON lower(u.email) = p.email AND u.deleted_at IS NULL;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
FROM demo_accounts
ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.team_club_affiliations (name)
SELECT DISTINCT team FROM demo_people
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.profiles (id, email, role, first_name, last_name, emergency_contact_name,
  emergency_contact_phone, emergency_contact_relationship, team_club_affiliation_id)
SELECT a.id, a.email, a.app_role, a.first_name, a.last_name, 'Demo Emergency Contact',
  '510-555-0100', 'Friend', t.id
FROM demo_accounts a JOIN public.team_club_affiliations t ON t.name = a.team
ON CONFLICT (id) DO UPDATE SET
  team_club_affiliation_id = COALESCE(profiles.team_club_affiliation_id, excluded.team_club_affiliation_id),
  emergency_contact_name = COALESCE(profiles.emergency_contact_name, excluded.emergency_contact_name),
  emergency_contact_phone = COALESCE(profiles.emergency_contact_phone, excluded.emergency_contact_phone),
  emergency_contact_relationship = COALESCE(profiles.emergency_contact_relationship, excluded.emergency_contact_relationship);

-- The Auth trigger can create a profile before the seed knows its intended app role.
UPDATE public.profiles p SET role = a.app_role
FROM demo_accounts a WHERE p.id = a.id AND p.role IS DISTINCT FROM a.app_role;

INSERT INTO public.volunteer_leader_domains (id, name, description, leader_id)
SELECT d.id::uuid, d.name, d.description, a.id
FROM (VALUES
  ('02600000-0000-4000-8000-000000000101', 'Demo · Course Operations', 'Course marshals, setup, and course sweep.'),
  ('02600000-0000-4000-8000-000000000102', 'Demo · Registration and Hospitality', 'Rider check-in, information, and volunteer support.'),
  ('02600000-0000-4000-8000-000000000103', 'Demo · Kids Clinic and NICA', 'Clinic check-in and team support.')
) d(id, name, description)
JOIN demo_accounts a ON a.email = 'leader@volunteer.test'
ON CONFLICT DO NOTHING;

-- Locations describe demo areas rather than an official 2026 assignment schedule.
INSERT INTO public.volunteer_roles (id, name, description, event_date, start_time, end_time,
  location, positions_total, created_by, domain_id, leader_id, critical, critical_positions_required, featured, completion_month)
SELECT d.id::uuid, 'Demo · ' || d.name, d.description, d.day, d.starts::time, d.ends::time, d.location,
  d.capacity, a.id, d.domain_id::uuid,
  CASE WHEN d.domain_id IS NULL THEN l.id END, d.must_fill > 0, d.must_fill, d.featured, d.month
FROM (VALUES
  ('02600000-0000-4000-8000-000000000201', 'BHRR Course Marshal', 'Direct riders and spectators at a course crossing.', DATE '2026-04-18', '07:00', '10:00', 'Road race course', 6, '02600000-0000-4000-8000-000000000101', 4, true, NULL::date),
  ('02600000-0000-4000-8000-000000000202', 'BHRR Registration', 'Check in road race participants and hand out number packets.', DATE '2026-04-18', '06:30', '09:30', 'Registration tent', 2, '02600000-0000-4000-8000-000000000102', 0, true, NULL),
  ('02600000-0000-4000-8000-000000000203', 'BSC Course Marshal', 'Help keep a spectator crossing clear during races.', DATE '2026-04-19', '08:00', '11:00', 'Criterium course', 8, '02600000-0000-4000-8000-000000000101', 5, true, NULL),
  ('02600000-0000-4000-8000-000000000204', 'BSC Information Table', 'Answer visitor questions and direct riders to registration.', DATE '2026-04-19', '11:00', '13:00', 'Information tent', 4, '02600000-0000-4000-8000-000000000102', 0, false, NULL),
  ('02600000-0000-4000-8000-000000000205', 'Kids Clinic Check-in', 'Welcome families and help organize the clinic queue.', DATE '2026-04-19', '10:30', '12:30', 'Clinic check-in', 3, '02600000-0000-4000-8000-000000000103', 1, true, NULL),
  ('02600000-0000-4000-8000-000000000206', 'Course Setup', 'Stage signs and equipment before race weekend.', DATE '2026-04-17', '16:00', '18:00', 'Equipment staging', 4, '02600000-0000-4000-8000-000000000101', 0, false, NULL),
  ('02600000-0000-4000-8000-000000000207', 'Equipment Return', 'Check and return borrowed supplies after race weekend.', DATE '2026-04-20', '17:00', '18:00', 'Equipment staging', 3, '02600000-0000-4000-8000-000000000101', 0, false, NULL),
  ('02600000-0000-4000-8000-000000000208', 'April Team Outreach', 'Coordinate volunteer availability with NICA teams.', NULL, '00:00', '00:00', 'Remote', 3, '02600000-0000-4000-8000-000000000103', 0, false, DATE '2026-04-01'),
  ('02600000-0000-4000-8000-000000000209', 'Roster Proofreading', 'Review volunteer names and shift notes on a flexible schedule.', NULL, '00:00', '00:00', 'Remote', 2, NULL, 0, false, NULL)
) d(id, name, description, day, starts, ends, location, capacity, domain_id, must_fill, featured, month)
JOIN demo_accounts a ON a.email = 'admin@volunteer.test'
JOIN demo_accounts l ON l.email = 'leader@volunteer.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.waivers (id, volunteer_id, agreed_at, signature_name, waiver_version, waiver_text,
  declared_minor, age_assessment_date, parent_guardian_name, parent_guardian_email, parent_signature_name, parent_signed_at)
SELECT d.id::uuid, a.id, TIMESTAMPTZ '2026-04-10 09:00:00-07', CASE WHEN NOT d.minor THEN a.first_name || ' ' || a.last_name END,
  s.version, s.waiver_text, d.minor, DATE '2026-04-10',
  CASE WHEN d.minor THEN 'Demo Parent' END, CASE WHEN d.minor THEN 'guardian@volunteer.test' END,
  CASE WHEN d.minor THEN 'Demo Parent' END, CASE WHEN d.minor THEN TIMESTAMPTZ '2026-04-10 09:00:00-07' END
FROM (VALUES
  ('02600000-0000-4000-8000-000000000301', 'volunteer@volunteer.test', false),
  ('02600000-0000-4000-8000-000000000302', 'crew@volunteer.test', false),
  ('02600000-0000-4000-8000-000000000303', 'junior@volunteer.test', true)
) d(id, email, minor)
JOIN demo_accounts a ON a.email = d.email
JOIN public.waiver_settings s ON s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.signups (id, volunteer_id, role_id, signed_up_at, status, waiver_signed, cancelled_at)
SELECT d.id::uuid, a.id, d.shift::uuid, TIMESTAMPTZ '2026-04-10 09:15:00-07', d.status, d.signed,
  CASE WHEN d.status = 'cancelled' THEN TIMESTAMPTZ '2026-04-11 09:00:00-07' END
FROM (VALUES
  ('02600000-0000-4000-8000-000000000401', 'volunteer@volunteer.test', '02600000-0000-4000-8000-000000000201', 'confirmed', true),
  ('02600000-0000-4000-8000-000000000402', 'crew@volunteer.test', '02600000-0000-4000-8000-000000000202', 'confirmed', true),
  ('02600000-0000-4000-8000-000000000403', 'checkin@volunteer.test', '02600000-0000-4000-8000-000000000202', 'confirmed', false),
  ('02600000-0000-4000-8000-000000000404', 'crew@volunteer.test', '02600000-0000-4000-8000-000000000203', 'confirmed', true),
  ('02600000-0000-4000-8000-000000000405', 'junior@volunteer.test', '02600000-0000-4000-8000-000000000205', 'confirmed', true),
  ('02600000-0000-4000-8000-000000000406', 'volunteer@volunteer.test', '02600000-0000-4000-8000-000000000204', 'cancelled', true),
  ('02600000-0000-4000-8000-000000000407', 'volunteer@volunteer.test', '02600000-0000-4000-8000-000000000208', 'confirmed', true),
  ('02600000-0000-4000-8000-000000000408', 'crew@volunteer.test', '02600000-0000-4000-8000-000000000209', 'confirmed', true)
) d(id, email, shift, status, signed)
JOIN demo_accounts a ON a.email = d.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.signups s WHERE s.volunteer_id = a.id AND s.role_id = d.shift::uuid
)
ON CONFLICT (volunteer_id, role_id) DO NOTHING;

INSERT INTO public.kids_clinic_signups (id, created_at, parent_first_name, parent_last_name,
  parent_email, child_name, child_gender, child_age, waiver_version, waiver_consent)
VALUES
  ('02600000-0000-4000-8000-000000000501', '2026-04-11 09:00:00-07', 'Taylor', 'Demo', 'clinic1@volunteer.test', 'Demo Rider One', 'girl', 8, '2026-demo', true),
  ('02600000-0000-4000-8000-000000000502', '2026-04-12 09:00:00-07', 'Jamie', 'Demo', 'clinic2@volunteer.test', 'Demo Rider Two', 'prefer_not_to_say', 10, '2026-demo', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nica_coaches (id, email, first_name, last_name, phone, team_club_affiliation_id, email_end_date, created_by)
SELECT d.id::uuid, d.email, d.first_name, 'Demo', '510-555-0101', t.id, DATE '2026-04-20', a.id
FROM (VALUES
  ('02600000-0000-4000-8000-000000000601', 'coach.albany@volunteer.test', 'Cameron', 'Albany'),
  ('02600000-0000-4000-8000-000000000602', 'coach.skyline@volunteer.test', 'Drew', 'Skyline')
) d(id, email, first_name, team)
JOIN public.team_club_affiliations t ON t.name = d.team
JOIN demo_accounts a ON a.email = 'admin@volunteer.test'
ON CONFLICT DO NOTHING;

-- Verify the expected record families before committing the local transaction.
DO $$
BEGIN
  IF (SELECT count(*) FROM demo_accounts) <> 7
     OR (SELECT count(*) FROM public.volunteer_roles WHERE id::text LIKE '02600000-0000-4000-8000-00000000020%') <> 9
     OR (SELECT count(*) FROM public.volunteer_leader_domains WHERE id::text LIKE '02600000-0000-4000-8000-00000000010%') <> 3
     OR (SELECT count(*) FROM public.signups WHERE id::text LIKE '02600000-0000-4000-8000-00000000040%') <> 8
     OR (SELECT count(*) FROM public.waivers WHERE id::text LIKE '02600000-0000-4000-8000-00000000030%') <> 3
     OR (SELECT count(*) FROM public.kids_clinic_signups WHERE id::text LIKE '02600000-0000-4000-8000-00000000050%') <> 2
     OR (SELECT count(*) FROM public.nica_coaches WHERE id::text LIKE '02600000-0000-4000-8000-00000000060%') <> 2 THEN
    RAISE EXCEPTION 'Omnium demo seed is incomplete; no changes were committed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
