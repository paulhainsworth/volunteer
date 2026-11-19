BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000081', 'notice-volunteer@example.invalid'),
  ('00000000-0000-4000-8000-000000000082', 'notice-admin@example.invalid'),
  ('00000000-0000-4000-8000-000000000083', 'notice-other@example.invalid');
UPDATE profiles SET role = 'admin' WHERE email = 'notice-admin@example.invalid';
INSERT INTO volunteer_roles (id, name, positions_total)
VALUES ('00000000-0000-4000-8000-000000000084', 'Notification fixture', 3);
INSERT INTO waivers (id, volunteer_id, waiver_version, waiver_text, declared_minor, age_assessment_date,
  parent_guardian_name, parent_guardian_email, parent_signature_name, parent_signed_at)
VALUES ('00000000-0000-4000-8000-000000000085',
  '00000000-0000-4000-8000-000000000081', 1, 'Fixture', true, CURRENT_DATE,
  'Fixture Guardian', 'notice-guardian@example.invalid', 'Fixture Guardian', now());
INSERT INTO signups (id, volunteer_id, role_id)
VALUES ('00000000-0000-4000-8000-000000000086',
  '00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000084');

DO $$
DECLARE
  volunteer uuid := '00000000-0000-4000-8000-000000000081';
  other_account uuid := '00000000-0000-4000-8000-000000000083';
  shift_id uuid := '00000000-0000-4000-8000-000000000084';
  waiver_id uuid := '00000000-0000-4000-8000-000000000085';
  cancellation_recipients jsonb;
  signup_id uuid := '00000000-0000-4000-8000-000000000086';
BEGIN
  IF has_function_privilege('authenticated', 'public.claim_volunteer_mail(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The notification claim must be server only';
  END IF;
  IF public.claim_volunteer_mail(other_account, 'confirmation', shift_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Account cannot claim another volunteer confirmation';
  END IF;
  IF public.claim_volunteer_mail(volunteer, 'confirmation', shift_id)->'recipients'
    IS DISTINCT FROM '["notice-volunteer@example.invalid"]'::jsonb THEN
    RAISE EXCEPTION 'Signup confirmation must use the verified account address';
  END IF;
  IF public.claim_volunteer_mail(volunteer, 'guardian_signup', shift_id)->'recipients'
    IS DISTINCT FROM '["notice-guardian@example.invalid"]'::jsonb THEN
    RAISE EXCEPTION 'Guardian confirmation must use the signed waiver address';
  END IF;
  IF public.claim_volunteer_mail(volunteer, 'guardian_waiver', waiver_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Both guardian notice paths must share a single claim';
  END IF;
  UPDATE signups SET status = 'cancelled' WHERE id = signup_id;
  cancellation_recipients := public.claim_volunteer_mail(volunteer, 'cancellation', signup_id)->'recipients';
  IF cancellation_recipients IS NULL
    OR NOT (cancellation_recipients ? 'notice-admin@example.invalid')
    OR (cancellation_recipients ?| ARRAY['notice-volunteer@example.invalid', 'notice-other@example.invalid']) THEN
    RAISE EXCEPTION 'Cancellation notice must use staff recipients';
  END IF;
  IF public.claim_volunteer_mail(volunteer, 'cancellation', signup_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Repeated cancellation notice should be skipped';
  END IF;
END
$$;

ROLLBACK;
