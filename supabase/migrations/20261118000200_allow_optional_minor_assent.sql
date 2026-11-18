ALTER TABLE public.waivers ALTER COLUMN signature_name DROP NOT NULL;

ALTER TABLE public.waivers ADD CONSTRAINT waivers_signature_or_guardian_consent CHECK (
  signature_name IS NOT NULL OR (
    nullif(btrim(parent_guardian_name), '') IS NOT NULL
    AND nullif(btrim(parent_guardian_email), '') IS NOT NULL
    AND nullif(btrim(parent_signature_name), '') IS NOT NULL
    AND parent_signed_at IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION public.confirm_volunteer_signup(
  p_role_id uuid,
  p_phone text DEFAULT NULL,
  p_consent jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  volunteer uuid := auth.uid();
  assignment public.signups%ROWTYPE;
  settings public.waiver_settings%ROWTYPE;
  minor boolean := coalesce(p_consent->>'is_minor' = 'true', false);
  signature text := nullif(btrim(p_consent->>'signature_name'), '');
  guardian_name text := nullif(btrim(p_consent->>'parent_guardian_name'), '');
  guardian_email text := nullif(btrim(p_consent->>'parent_guardian_email'), '');
  guardian_signature text := nullif(btrim(p_consent->>'parent_signature_name'), '');
BEGIN
  IF volunteer IS NULL THEN
    RAISE EXCEPTION 'Sign in before confirming your signup' USING ERRCODE = '42501';
  END IF;

  -- Serialize retries and seat allocation with every other writer for this role.
  PERFORM 1 FROM public.volunteer_roles WHERE id = p_role_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Volunteer role not found';
  END IF;
  SELECT * INTO assignment FROM public.signups WHERE role_id = p_role_id AND volunteer_id = volunteer;
  IF assignment.status = 'confirmed' THEN
    RETURN jsonb_build_object('signup', to_jsonb(assignment), 'created', false);
  END IF;

  SELECT * INTO settings FROM public.waiver_settings WHERE id = 1 FOR SHARE;
  IF NOT FOUND OR settings.version IS NULL THEN
    RAISE EXCEPTION 'The current waiver is unavailable';
  END IF;

  IF p_consent IS NOT NULL THEN
    IF (NOT minor AND signature IS NULL) OR p_consent->>'version' IS DISTINCT FROM settings.version::text THEN
      RAISE EXCEPTION 'Review and sign the current waiver before confirming your signup';
    END IF;
    IF minor
       AND (guardian_name IS NULL OR guardian_email IS NULL OR guardian_signature IS NULL) THEN
      RAISE EXCEPTION 'Parent or guardian consent is required';
    END IF;

    INSERT INTO public.waivers (
      volunteer_id, signature_name, waiver_version, waiver_text,
      parent_guardian_name, parent_guardian_email, parent_guardian_phone,
      parent_signature_name, parent_signed_at
    ) VALUES (
      volunteer, signature, settings.version, settings.waiver_text,
      guardian_name, guardian_email, nullif(btrim(p_consent->>'parent_guardian_phone'), ''),
      guardian_signature, CASE WHEN guardian_signature IS NOT NULL THEN now() END
    );
  END IF;

  IF assignment.id IS NULL THEN
    INSERT INTO public.signups (role_id, volunteer_id, status, phone)
    VALUES (p_role_id, volunteer, 'confirmed', nullif(btrim(p_phone), ''))
    RETURNING * INTO assignment;
  ELSE
    UPDATE public.signups
    SET status = 'confirmed', phone = nullif(btrim(p_phone), ''), signed_up_at = now()
    WHERE id = assignment.id
    RETURNING * INTO assignment;
  END IF;

  RETURN jsonb_build_object('signup', to_jsonb(assignment), 'created', true);
END;
$$;
