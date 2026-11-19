\set ON_ERROR_STOP on
BEGIN READ ONLY;

SELECT object_name, present
FROM (VALUES
  ('auth.users', to_regclass('auth.users') IS NOT NULL),
  ('public.volunteer_leader_domains', to_regclass('public.volunteer_leader_domains') IS NOT NULL),
  ('public.team_club_affiliations', to_regclass('public.team_club_affiliations') IS NOT NULL),
  ('public.nica_coaches', to_regclass('public.nica_coaches') IS NOT NULL),
  ('public.waivers.declared_minor', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'waivers' AND column_name = 'declared_minor'
  )),
  ('public.get_confirmed_signup_counts(uuid[])', to_regprocedure('public.get_confirmed_signup_counts(uuid[])') IS NOT NULL),
  ('public.confirm_volunteer_signup(uuid,text,jsonb)', to_regprocedure('public.confirm_volunteer_signup(uuid,text,jsonb)') IS NOT NULL),
  ('public.reserve_clinic_registration(jsonb)', to_regprocedure('public.reserve_clinic_registration(jsonb)') IS NOT NULL),
  ('public.set_volunteer_profile_role(uuid,text)', to_regprocedure('public.set_volunteer_profile_role(uuid,text)') IS NOT NULL),
  ('public.claim_auth_mail_request(text,text)', to_regprocedure('public.claim_auth_mail_request(text,text)') IS NOT NULL),
  ('public.claim_volunteer_mail(uuid,text,uuid)', to_regprocedure('public.claim_volunteer_mail(uuid,text,uuid)') IS NOT NULL),
  ('public.sign_volunteer_waiver(jsonb) returns uuid',
    coalesce(pg_get_function_result(to_regprocedure('public.sign_volunteer_waiver(jsonb)')) = 'uuid', false)),
  ('authenticated profile read policy', EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = to_regclass('public.profiles')
      AND polname = 'Authenticated profiles are limited to the volunteer and permitted staff'
  ))
) AS baseline(object_name, present)
ORDER BY object_name;

SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS migration_history_available \gset
\if :migration_history_available
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
\else
\echo Supabase migration history table is missing.
\endif

ROLLBACK;
