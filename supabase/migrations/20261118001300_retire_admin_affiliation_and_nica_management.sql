-- Keep affiliation rows and historical beneficiary settings for existing data and migration history.
REVOKE EXECUTE ON FUNCTION public.create_team_club_affiliation(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_nica_beneficiary(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE SELECT ON public.nica_beneficiaries, public.nica_beneficiary_affiliations FROM PUBLIC, anon, authenticated;
