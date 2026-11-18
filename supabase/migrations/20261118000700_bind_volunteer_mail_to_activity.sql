ALTER TABLE public.signups ADD COLUMN cancelled_at timestamptz;

CREATE FUNCTION public.record_signup_cancelled_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.cancelled_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.cancelled_at := CASE WHEN NEW.status = 'cancelled' THEN now() END;
  ELSE
    NEW.cancelled_at := OLD.cancelled_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_signup_cancelled_at
  BEFORE INSERT OR UPDATE OF status, cancelled_at ON public.signups
  FOR EACH ROW EXECUTE FUNCTION public.record_signup_cancelled_at();

CREATE TABLE public.volunteer_mail_claims (
  kind text NOT NULL,
  activity_id uuid NOT NULL,
  event_at timestamptz NOT NULL,
  volunteer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, activity_id, event_at)
);
ALTER TABLE public.volunteer_mail_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.volunteer_mail_claims FROM PUBLIC, anon, authenticated;
CREATE INDEX ON public.volunteer_mail_claims (volunteer_id, event_at);

CREATE FUNCTION public.claim_volunteer_mail(p_volunteer uuid, p_kind text, p_reference uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  volunteer public.profiles%ROWTYPE;
  assignment public.signups%ROWTYPE;
  shift public.volunteer_roles%ROWTYPE;
  consent public.waivers%ROWTYPE;
  recipient text;
  recipients text[];
  leader_id uuid;
  activity_id uuid;
  event_at timestamptz;
BEGIN
  SELECT * INTO volunteer FROM public.profiles WHERE id = p_volunteer;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_kind = 'guardian_waiver' THEN
    SELECT * INTO consent FROM public.waivers w
    WHERE w.volunteer_id = p_volunteer
      AND w.declared_minor IS TRUE AND w.parent_signed_at IS NOT NULL
    ORDER BY w.agreed_at DESC, w.id DESC LIMIT 1;
    activity_id := consent.id;
    event_at := consent.agreed_at;
  ELSIF p_kind IN ('confirmation', 'guardian_signup', 'cancellation') THEN
    SELECT * INTO assignment FROM public.signups s
    WHERE s.volunteer_id = p_volunteer
      AND ((p_kind = 'cancellation' AND s.id = p_reference AND s.status = 'cancelled')
        OR (p_kind <> 'cancellation' AND s.role_id = p_reference AND s.status = 'confirmed'));
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO shift FROM public.volunteer_roles WHERE id = assignment.role_id;
    activity_id := assignment.id;
    event_at := CASE WHEN p_kind = 'cancellation' THEN assignment.cancelled_at ELSE assignment.signed_up_at END;

    IF p_kind = 'guardian_signup' THEN
      SELECT * INTO consent FROM public.waivers w
      WHERE w.volunteer_id = p_volunteer
        AND w.agreed_at = assignment.signed_up_at
        AND w.declared_minor IS TRUE AND w.parent_signed_at IS NOT NULL
      ORDER BY w.id DESC LIMIT 1;
      IF NOT FOUND THEN RETURN NULL; END IF;
      -- Both guardian paths describe this exact consent and share one claim.
      activity_id := consent.id;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  IF event_at IS NULL OR event_at NOT BETWEEN now() - interval '15 minutes' AND now() THEN
    RETURN NULL;
  END IF;

  IF p_kind IN ('guardian_waiver', 'guardian_signup') THEN
    recipient := consent.parent_guardian_email;
  ELSIF p_kind = 'confirmation' THEN
    SELECT email INTO recipient FROM auth.users WHERE id = p_volunteer;
  ELSE
    SELECT coalesce(d.leader_id, shift.leader_id) INTO leader_id
    FROM (SELECT 1) AS base
    LEFT JOIN public.volunteer_leader_domains d ON d.id = shift.domain_id;
    SELECT array_agg(DISTINCT u.email) INTO recipients
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
    WHERE u.email IS NOT NULL AND (p.role = 'admin' OR p.id = leader_id);
  END IF;
  IF recipient IS NOT NULL THEN recipients := ARRAY[recipient]; END IF;
  IF recipients IS NULL THEN RETURN NULL; END IF;

  -- Serialize mail claims for one volunteer, including repeated waiver signing.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_volunteer::text, 0));
  IF (SELECT count(*) FROM public.volunteer_mail_claims c
      WHERE c.volunteer_id = p_volunteer AND c.event_at >= now() - interval '15 minutes') >= 12 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.volunteer_mail_claims VALUES (
    CASE WHEN p_kind IN ('guardian_waiver', 'guardian_signup') THEN 'guardian' ELSE p_kind END,
    activity_id, event_at, p_volunteer
  )
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'recipients', recipients,
    'volunteerName', concat_ws(' ', volunteer.first_name, volunteer.last_name),
    'firstName', volunteer.first_name,
    'guardianName', consent.parent_guardian_name,
    'roleId', shift.id, 'roleName', shift.name, 'roleDate', shift.event_date,
    'roleMonth', shift.completion_month, 'roleStart', shift.start_time, 'roleEnd', shift.end_time, 'roleLocation', shift.location
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_volunteer_mail(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_volunteer_mail(uuid, text, uuid) TO service_role;
