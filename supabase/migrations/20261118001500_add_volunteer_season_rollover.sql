CREATE TABLE public.volunteer_season (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_year integer CHECK (active_year BETWEEN 2001 AND 2100)
);

INSERT INTO public.volunteer_season DEFAULT VALUES;

ALTER TABLE public.volunteer_season ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.volunteer_season FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.volunteer_season TO anon, authenticated;
GRANT UPDATE (active_year) ON public.volunteer_season TO authenticated;

CREATE POLICY "Anyone can read the roster season"
  ON public.volunteer_season FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Administrators can change the roster season"
  ON public.volunteer_season FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Public role listings show the active season"
  ON public.volunteer_roles AS RESTRICTIVE FOR SELECT TO anon
  USING (NOT EXISTS (
    SELECT 1 FROM public.volunteer_season
    WHERE coalesce(volunteer_roles.event_date, volunteer_roles.completion_month) < make_date(active_year, 1, 1)
  ));

CREATE FUNCTION public.preview_volunteer_season(p_active_year integer)
RETURNS TABLE (archived_shifts bigint, inactive_volunteers bigint, retained_staff bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  season_start date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can preview a roster rollover' USING ERRCODE = '42501';
  END IF;
  IF p_active_year IS NULL OR p_active_year NOT BETWEEN 2001 AND 2100 THEN
    RAISE EXCEPTION 'Enter a roster year between 2001 and 2100' USING ERRCODE = '22023';
  END IF;
  season_start := make_date(p_active_year, 1, 1);

  RETURN QUERY
  WITH shift_dates AS (
    SELECT id, coalesce(event_date, completion_month) AS scheduled_date FROM public.volunteer_roles
  ), participation AS (
    SELECT s.volunteer_id,
           bool_or(d.scheduled_date < season_start) AS has_history,
           bool_or(d.scheduled_date IS NULL OR d.scheduled_date >= season_start) AS takes_active_shift
    FROM public.signups s JOIN shift_dates d ON d.id = s.role_id
    WHERE s.status = 'confirmed'
    GROUP BY s.volunteer_id
  )
  SELECT
    (SELECT count(*) FROM shift_dates WHERE scheduled_date < season_start),
    (SELECT count(*) FROM participation p JOIN public.profiles u ON u.id = p.volunteer_id
      WHERE u.role = 'volunteer' AND p.has_history AND NOT p.takes_active_shift),
    (SELECT count(*) FROM public.profiles WHERE role IN ('admin', 'volunteer_leader'));
END;
$$;

REVOKE ALL ON FUNCTION public.preview_volunteer_season(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_volunteer_season(integer) TO authenticated;

CREATE FUNCTION public.guard_archived_shift_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  season_year integer;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND OLD.role_id = NEW.role_id AND OLD.volunteer_id = NEW.volunteer_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT active_year INTO season_year FROM public.volunteer_season WHERE id = 1 FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM public.volunteer_roles
    WHERE id = NEW.role_id AND coalesce(event_date, completion_month) < make_date(season_year, 1, 1)
  ) THEN
    RAISE EXCEPTION 'This volunteer shift belongs to an archived season';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_archived_shift_signup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_archived_shift_signup
  BEFORE INSERT OR UPDATE OF status, role_id, volunteer_id ON public.signups
  FOR EACH ROW EXECUTE FUNCTION public.guard_archived_shift_signup();
