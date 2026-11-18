CREATE FUNCTION public.profile_visible_to_current_volunteer(p_profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_profile = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS viewer
      WHERE viewer.id = auth.uid()
        AND viewer.role IN ('admin', 'volunteer_leader')
    )
    OR EXISTS (
      SELECT 1
      FROM public.signups AS signup
      JOIN public.volunteer_roles AS shift ON shift.id = signup.role_id
      LEFT JOIN public.volunteer_leader_domains AS domain ON domain.id = shift.domain_id
      WHERE signup.volunteer_id = auth.uid() AND signup.status = 'confirmed'
        AND p_profile IN (shift.leader_id, domain.leader_id)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.profile_visible_to_current_volunteer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_visible_to_current_volunteer(uuid) TO authenticated;

CREATE POLICY "Authenticated profiles are limited to the volunteer and permitted staff"
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.profile_visible_to_current_volunteer(id));
