BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000093', 'nica-admin@example.invalid'),
  ('00000000-0000-4000-8000-000000000094', 'nica-volunteer@example.invalid');
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-000000000093';
INSERT INTO public.team_club_affiliations (id, name) VALUES
  ('00000000-0000-4000-8000-000000000095', 'Fixture Cycling');

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  new_id uuid;
  fixture_id uuid := '00000000-0000-4000-8000-000000000095';
  occupied_id uuid;
BEGIN
  IF has_function_privilege('anon', 'public.save_nica_beneficiary(uuid,text,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not be able to save beneficiaries';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000094', true);
  IF EXISTS (SELECT FROM public.nica_beneficiaries) THEN
    RAISE EXCEPTION 'Volunteer unexpectedly read beneficiary management data';
  END IF;
  BEGIN
    PERFORM public.save_nica_beneficiary(NULL, 'Unauthorized', ARRAY[fixture_id]);
    RAISE EXCEPTION 'Volunteer unexpectedly saved a beneficiary';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000093', true);
  IF (SELECT count(*) FROM public.nica_beneficiaries) <> 6 THEN
    RAISE EXCEPTION 'The six existing beneficiaries were not preserved';
  END IF;
  SELECT a.affiliation_id INTO STRICT occupied_id
  FROM public.nica_beneficiary_affiliations a JOIN public.nica_beneficiaries b ON a.beneficiary_id = b.id
  WHERE b.label = 'Albany'
  ORDER BY a.affiliation_id
  LIMIT 1;

  new_id := public.save_nica_beneficiary(NULL, ' Fixture Team ', ARRAY[fixture_id]);
  PERFORM public.save_nica_beneficiary(new_id, 'Renamed Team', ARRAY[fixture_id]);

  BEGIN
    PERFORM public.save_nica_beneficiary(new_id, 'Should Roll Back', ARRAY[occupied_id]);
    RAISE EXCEPTION 'An affiliation was assigned to two teams';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT FROM public.nica_beneficiaries b JOIN public.nica_beneficiary_affiliations a ON a.beneficiary_id = b.id
    WHERE b.id = new_id AND b.label = 'Renamed Team' AND a.affiliation_id = fixture_id
  ) THEN
    RAISE EXCEPTION 'A conflicted save did not preserve the prior label and affiliation';
  END IF;
END
$$;

ROLLBACK;
