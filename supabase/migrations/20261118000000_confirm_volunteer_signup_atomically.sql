-- All assignment writers share the capacity guard, including organizer writes.
CREATE OR REPLACE FUNCTION public.guard_confirmed_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  capacity integer;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND OLD.role_id = NEW.role_id
       AND OLD.volunteer_id = NEW.volunteer_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT positions_total INTO capacity
  FROM public.volunteer_roles
  WHERE id = NEW.role_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Volunteer role not found';
  END IF;
  IF (SELECT count(*) FROM public.signups WHERE role_id = NEW.role_id AND status = 'confirmed') >= capacity THEN
    RAISE EXCEPTION 'This role is already full';
  END IF;

  IF auth.uid() = NEW.volunteer_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.waivers w
      JOIN public.waiver_settings settings ON settings.id = 1 AND settings.version = w.waiver_version
      WHERE w.volunteer_id = NEW.volunteer_id
    ) THEN
      RAISE EXCEPTION 'Sign the current waiver before confirming your signup';
    END IF;
    NEW.waiver_signed := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_confirmed_signup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_confirmed_signup
BEFORE INSERT OR UPDATE OF status, role_id, volunteer_id ON public.signups
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_signup();

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
    IF signature IS NULL OR p_consent->>'version' IS DISTINCT FROM settings.version::text THEN
      RAISE EXCEPTION 'Review and sign the current waiver before confirming your signup';
    END IF;
    IF p_consent->>'is_minor' = 'true'
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

REVOKE ALL ON FUNCTION public.confirm_volunteer_signup(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_volunteer_signup(uuid, text, jsonb) TO authenticated;
