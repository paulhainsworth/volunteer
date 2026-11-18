CREATE OR REPLACE FUNCTION public.search_volunteer_contacts(p_query text)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  role_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH q AS (
    SELECT lower(btrim(p_query)) AS t
    WHERE EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'volunteer_leader')
    )
  ),
  matched AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone
    FROM public.profiles p
    CROSS JOIN q
    WHERE length(q.t) BETWEEN 3 AND 120
      AND (
        strpos(lower(p.first_name), q.t) > 0
        OR strpos(lower(p.last_name), q.t) > 0
        OR strpos(lower(p.email), q.t) > 0
      )
  ),
  roles AS (
    SELECT
      s.volunteer_id,
      array_agg(DISTINCT vr.name) AS role_names
    FROM public.signups s
    JOIN matched m ON m.id = s.volunteer_id
    INNER JOIN public.volunteer_roles vr ON vr.id = s.role_id
    WHERE s.status = 'confirmed'
    GROUP BY s.volunteer_id
  )
  SELECT
    m.id,
    m.first_name,
    m.last_name,
    m.email,
    m.phone,
    coalesce(r.role_names, ARRAY[]::text[]) AS role_names
  FROM matched m
  LEFT JOIN roles r ON r.volunteer_id = m.id
  ORDER BY m.last_name NULLS LAST, m.first_name NULLS LAST
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.search_volunteer_contacts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_volunteer_contacts(text) TO authenticated;
COMMENT ON FUNCTION public.search_volunteer_contacts(text) IS
  'Volunteer contact lookup for administrators and volunteer leaders.';
