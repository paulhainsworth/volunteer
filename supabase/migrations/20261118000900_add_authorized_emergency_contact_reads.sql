CREATE FUNCTION public.get_own_volunteer_profile()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT profile.*
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();
$$;

CREATE FUNCTION public.get_volunteer_emergency_contacts(p_profile_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT profile.id, profile.emergency_contact_name,
    profile.emergency_contact_phone, profile.emergency_contact_relationship
  FROM public.profiles AS profile
  JOIN public.profiles AS viewer ON viewer.id = auth.uid()
  WHERE profile.id = ANY(p_profile_ids)
    AND (
      viewer.id = profile.id
      OR viewer.role IN ('admin', 'volunteer_leader')
    );
$$;

REVOKE ALL ON FUNCTION public.get_own_volunteer_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_volunteer_emergency_contacts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_volunteer_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_volunteer_emergency_contacts(uuid[]) TO authenticated;
