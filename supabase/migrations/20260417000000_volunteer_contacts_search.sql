-- Public contact directory: search profiles by name/email and list confirmed role names
-- (requires SECURITY DEFINER so signups can be joined for anonymous users).
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
SET search_path = public
AS $$
  WITH q AS (
    SELECT btrim(p_query) AS t
  ),
  matched AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone
    FROM profiles p
    CROSS JOIN q
    WHERE length(q.t) >= 3
      AND (
        p.first_name ILIKE '%' || q.t || '%'
        OR p.last_name ILIKE '%' || q.t || '%'
        OR p.email ILIKE '%' || q.t || '%'
      )
  ),
  roles AS (
    SELECT
      s.volunteer_id,
      array_agg(DISTINCT vr.name) AS role_names
    FROM signups s
    INNER JOIN volunteer_roles vr ON vr.id = s.role_id
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

REVOKE ALL ON FUNCTION public.search_volunteer_contacts(text) FROM public;
GRANT EXECUTE ON FUNCTION public.search_volunteer_contacts(text) TO anon, authenticated;

COMMENT ON FUNCTION public.search_volunteer_contacts(text) IS
  'Omnium contacts directory: search volunteers by name/email; includes confirmed role names.';
