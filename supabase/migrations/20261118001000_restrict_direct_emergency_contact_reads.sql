-- Apply after the frontend switches its profile reads to the authorized operations.
REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, email, role, first_name, last_name, phone, created_at, last_login, team_club_affiliation_id)
  ON public.profiles TO anon, authenticated;
