-- Older records keep their original signatures and have an unknown age declaration.
ALTER TABLE public.waivers
  ADD COLUMN declared_minor boolean,
  ADD COLUMN age_assessment_date date;

DROP POLICY IF EXISTS "Volunteers can create own waivers" ON public.waivers;
REVOKE INSERT ON public.waivers FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.has_applicable_waiver(p_volunteer uuid, p_assessment_date date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.waivers w
    JOIN public.waiver_settings s ON s.id = 1 AND s.version = w.waiver_version
    WHERE w.volunteer_id = p_volunteer
      AND w.age_assessment_date IS NOT NULL
      AND (
        (w.declared_minor AND w.parent_signed_at IS NOT NULL)
        OR (NOT w.declared_minor AND w.age_assessment_date <= p_assessment_date)
      )
  );
$$;

CREATE FUNCTION public.record_volunteer_waiver(p_volunteer uuid, p_assessment_date date, p_consent jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  settings public.waiver_settings%ROWTYPE;
  minor boolean;
  signature text := nullif(btrim(p_consent->>'signature_name'), '');
  guardian_name text := nullif(btrim(p_consent->>'parent_guardian_name'), '');
  guardian_email text := nullif(btrim(p_consent->>'parent_guardian_email'), '');
  guardian_signature text := nullif(btrim(p_consent->>'parent_signature_name'), '');
BEGIN
  IF jsonb_typeof(p_consent->'is_minor') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Declare whether the volunteer will be under 18';
  END IF;
  minor := (p_consent->>'is_minor')::boolean;

  SELECT * INTO settings FROM public.waiver_settings WHERE id = 1 FOR SHARE;
  IF NOT FOUND OR settings.version IS NULL THEN
    RAISE EXCEPTION 'The current waiver is unavailable';
  END IF;
  IF (NOT minor AND signature IS NULL) OR p_consent->>'version' IS DISTINCT FROM settings.version::text THEN
    RAISE EXCEPTION 'Review and sign the current waiver before continuing';
  END IF;
  IF minor AND (guardian_name IS NULL OR guardian_email IS NULL OR guardian_signature IS NULL) THEN
    RAISE EXCEPTION 'Parent or guardian consent is required';
  END IF;

  INSERT INTO public.waivers (
    volunteer_id, signature_name, waiver_version, waiver_text, declared_minor, age_assessment_date,
    parent_guardian_name, parent_guardian_email, parent_guardian_phone, parent_signature_name, parent_signed_at
  ) VALUES (
    p_volunteer, signature, settings.version, settings.waiver_text, minor, p_assessment_date,
    CASE WHEN minor THEN guardian_name END, CASE WHEN minor THEN guardian_email END,
    CASE WHEN minor THEN nullif(btrim(p_consent->>'parent_guardian_phone'), '') END,
    CASE WHEN minor THEN guardian_signature END, CASE WHEN minor THEN now() END
  );
END;
$$;

CREATE FUNCTION public.sign_volunteer_waiver(p_consent jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before signing a waiver' USING ERRCODE = '42501';
  END IF;
  PERFORM public.record_volunteer_waiver(auth.uid(), CURRENT_DATE, p_consent);
END;
$$;

CREATE FUNCTION public.volunteer_waiver_is_current(p_role_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  assessment_date date := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF p_role_id IS NOT NULL THEN
    SELECT coalesce(event_date, CURRENT_DATE) INTO assessment_date
    FROM public.volunteer_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;
  RETURN public.has_applicable_waiver(auth.uid(), assessment_date);
END;
$$;

REVOKE ALL ON FUNCTION public.has_applicable_waiver(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_volunteer_waiver(uuid, date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sign_volunteer_waiver(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.volunteer_waiver_is_current(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_volunteer_waiver(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.volunteer_waiver_is_current(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_confirmed_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  capacity integer;
  assessment_date date;
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

  SELECT positions_total, coalesce(event_date, CURRENT_DATE) INTO capacity, assessment_date
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
    IF NOT public.has_applicable_waiver(NEW.volunteer_id, assessment_date) THEN
      RAISE EXCEPTION 'Sign the current waiver before confirming your signup';
    END IF;
    NEW.waiver_signed := true;
  END IF;
  RETURN NEW;
END;
$$;

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
  assessment_date date;
BEGIN
  IF volunteer IS NULL THEN
    RAISE EXCEPTION 'Sign in before confirming your signup' USING ERRCODE = '42501';
  END IF;

  -- Serialize retries and seat allocation with every other writer for this role.
  SELECT coalesce(event_date, CURRENT_DATE) INTO assessment_date
  FROM public.volunteer_roles WHERE id = p_role_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Volunteer role not found';
  END IF;
  SELECT * INTO assignment FROM public.signups WHERE role_id = p_role_id AND volunteer_id = volunteer;
  IF assignment.status = 'confirmed' THEN
    RETURN jsonb_build_object('signup', to_jsonb(assignment), 'created', false);
  END IF;

  IF p_consent IS NOT NULL THEN
    PERFORM public.record_volunteer_waiver(volunteer, assessment_date, p_consent);
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
