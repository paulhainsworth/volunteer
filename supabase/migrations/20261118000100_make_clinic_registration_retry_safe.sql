ALTER TABLE public.kids_clinic_signups
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.reserve_clinic_registration(p_registration jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registration public.kids_clinic_signups%ROWTYPE;
  child_key text := lower(regexp_replace(btrim(p_registration->>'child_name'), '\s+', ' ', 'g'));
BEGIN
  -- The clinic has a single registration stream. Serialize the brief lookup,
  -- rate checks and insert so a concurrent retry cannot create another row.
  PERFORM pg_advisory_xact_lock(10041, 1);

  SELECT * INTO registration
  FROM public.kids_clinic_signups
  WHERE parent_email = p_registration->>'parent_email'
    AND lower(regexp_replace(btrim(child_name), '\s+', ' ', 'g')) = child_key
    AND child_age = (p_registration->>'child_age')::smallint
    AND waiver_version = p_registration->>'waiver_version'
  ORDER BY created_at, id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', registration.id, 'created', false,
      'emailSent', registration.confirmation_email_sent_at IS NOT NULL);
  END IF;

  IF (SELECT count(*) FROM public.kids_clinic_signups
      WHERE created_at > now() - interval '1 minute') >= 120
     OR (SELECT count(*) FROM public.kids_clinic_signups
         WHERE parent_email = p_registration->>'parent_email'
           AND created_at > now() - interval '10 minutes') >= 5 THEN
    RETURN jsonb_build_object('limited', true);
  END IF;

  registration := jsonb_populate_record(NULL::public.kids_clinic_signups, p_registration);
  INSERT INTO public.kids_clinic_signups (
    parent_first_name, parent_last_name, parent_email, child_name,
    child_gender, child_age, waiver_version, waiver_consent
  ) VALUES (
    registration.parent_first_name, registration.parent_last_name, registration.parent_email,
    registration.child_name, registration.child_gender, registration.child_age,
    registration.waiver_version, registration.waiver_consent
  ) RETURNING * INTO registration;

  RETURN jsonb_build_object('id', registration.id, 'created', true, 'emailSent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_clinic_registration(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_clinic_registration(jsonb) TO service_role;
