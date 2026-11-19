CREATE FUNCTION public.create_team_club_affiliation(p_name text)
RETURNS TABLE (id uuid, name text, sort_order integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_name text := btrim(p_name, E' \t\n\r');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can add team or club affiliations' USING ERRCODE = '42501';
  END IF;

  IF clean_name IS NULL OR char_length(clean_name) NOT BETWEEN 1 AND 100 OR clean_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a name from 1 to 100 characters' USING ERRCODE = '22023';
  END IF;

  -- Serialize creation of names that differ only by case or surrounding spaces.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(clean_name), 0));
  IF EXISTS (
    SELECT 1 FROM public.team_club_affiliations a WHERE lower(btrim(a.name, E' \t\n\r')) = lower(clean_name)
  ) THEN
    RAISE EXCEPTION 'This team or club affiliation already exists' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
  INSERT INTO public.team_club_affiliations AS affiliation (name)
  VALUES (clean_name)
  RETURNING affiliation.id, affiliation.name, affiliation.sort_order;
END
$$;

REVOKE ALL ON FUNCTION public.create_team_club_affiliation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_club_affiliation(text) TO authenticated;
