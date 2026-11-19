CREATE TABLE public.nica_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX nica_beneficiaries_label_unique ON public.nica_beneficiaries (lower(label));

CREATE TABLE public.nica_beneficiary_affiliations (
  affiliation_id uuid PRIMARY KEY REFERENCES public.team_club_affiliations(id) ON DELETE CASCADE,
  beneficiary_id uuid NOT NULL REFERENCES public.nica_beneficiaries(id) ON DELETE CASCADE
);

CREATE INDEX nica_beneficiary_affiliations_beneficiary_idx
  ON public.nica_beneficiary_affiliations (beneficiary_id);

ALTER TABLE public.nica_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nica_beneficiary_affiliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nica_beneficiaries, public.nica_beneficiary_affiliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nica_beneficiaries, public.nica_beneficiary_affiliations TO authenticated, service_role;

CREATE POLICY "Admins read NICA beneficiaries" ON public.nica_beneficiaries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "Admins read NICA affiliation mappings" ON public.nica_beneficiary_affiliations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

INSERT INTO public.nica_beneficiaries (label) VALUES
  ('Albany'), ('Berkeley'), ('El Cerrito'), ('Oakland Composite'), ('Oakland Technical'), ('Skyline');

INSERT INTO public.nica_beneficiary_affiliations (beneficiary_id, affiliation_id)
SELECT b.id, a.id
FROM (VALUES
  ('Albany', 'Albany'), ('Albany', 'Albany High School Mountain Bike Team'),
  ('Berkeley', 'Berkeley'), ('Berkeley', 'Berkeley Mountain Bike Association'),
  ('El Cerrito', 'El Cerrito'), ('El Cerrito', 'El Cerrito High School'),
  ('Oakland Composite', 'Oakland Composite'),
  ('Oakland Technical', 'Oakland Technical'), ('Oakland Technical', 'Oakland Technical High School MTB'),
  ('Skyline', 'Skyline'), ('Skyline', 'Skyline High School Mountain Bike Team')
) AS legacy(label, affiliation_name)
JOIN public.nica_beneficiaries b ON b.label = legacy.label
JOIN public.team_club_affiliations a ON a.name = legacy.affiliation_name;

CREATE FUNCTION public.save_nica_beneficiary(p_id uuid, p_label text, p_affiliation_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_label text := btrim(p_label, E' \t\n\r');
  saved_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can manage NICA beneficiaries' USING ERRCODE = '42501';
  END IF;

  IF clean_label IS NULL OR char_length(clean_label) NOT BETWEEN 1 AND 100 OR clean_label ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a beneficiary name from 1 to 100 characters' USING ERRCODE = '22023';
  END IF;

  IF coalesce(cardinality(p_affiliation_ids), 0) = 0 OR EXISTS (
    SELECT 1 FROM unnest(p_affiliation_ids) AS chosen(id)
    LEFT JOIN public.team_club_affiliations a ON a.id = chosen.id
    WHERE a.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose at least one existing team or club affiliation' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.nica_beneficiaries (label) VALUES (clean_label) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.nica_beneficiaries SET label = clean_label WHERE id = p_id RETURNING id INTO saved_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NICA beneficiary no longer exists' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.nica_beneficiary_affiliations WHERE beneficiary_id = saved_id;
  -- The primary key makes the mapping exclusive, including for simultaneous admin saves.
  INSERT INTO public.nica_beneficiary_affiliations (beneficiary_id, affiliation_id)
  SELECT saved_id, id FROM (SELECT DISTINCT unnest(p_affiliation_ids) AS id) AS chosen
  ORDER BY id;

  RETURN saved_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'The name is already in use or an affiliation belongs to another beneficiary'
      USING ERRCODE = '23505';
END
$$;

REVOKE ALL ON FUNCTION public.save_nica_beneficiary(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_nica_beneficiary(uuid, text, uuid[]) TO authenticated;
