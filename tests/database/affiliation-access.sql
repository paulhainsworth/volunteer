BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000081', 'affiliation-admin@example.invalid'),
  ('00000000-0000-4000-8000-000000000082', 'affiliation-leader@example.invalid'),
  ('00000000-0000-4000-8000-000000000083', 'affiliation-volunteer@example.invalid');
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-000000000081';
UPDATE public.profiles SET role = 'volunteer_leader' WHERE id = '00000000-0000-4000-8000-000000000082';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  viewer uuid;
  saved record;
BEGIN
  IF has_function_privilege('anon', 'public.create_team_club_affiliation(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous visitors must not have affiliation creation access';
  END IF;

  FOREACH viewer IN ARRAY ARRAY[
    '00000000-0000-4000-8000-000000000082'::uuid,
    '00000000-0000-4000-8000-000000000083'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', viewer::text, true);
    BEGIN
      PERFORM public.create_team_club_affiliation('Unauthorized Affiliation');
      RAISE EXCEPTION 'Non-admin creation unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000081', true);
  SELECT * INTO STRICT saved FROM public.create_team_club_affiliation(E' \tFixture Cycling ');
  IF saved.name <> 'Fixture Cycling' OR saved.id IS NULL OR saved.sort_order <> 999 THEN
    RAISE EXCEPTION 'Unexpected affiliation result: %', saved;
  END IF;

  BEGIN
    PERFORM public.create_team_club_affiliation('fixture cycling');
    RAISE EXCEPTION 'Duplicate name unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.create_team_club_affiliation(E' \t ');
    RAISE EXCEPTION 'Blank name unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$$;

ROLLBACK;
