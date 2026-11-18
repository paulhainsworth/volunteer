-- Keep anonymous joins working while withholding profile rows.
CREATE POLICY "Anonymous profiles are hidden"
  ON public.profiles AS RESTRICTIVE FOR SELECT TO anon USING (false);

CREATE FUNCTION public.guard_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.role = 'volunteer' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only administrators can assign account roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_profile_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

CREATE FUNCTION public.set_volunteer_profile_role(p_profile_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can assign account roles' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('admin', 'volunteer_leader', 'volunteer') THEN
    RAISE EXCEPTION 'Unsupported account role' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_volunteer_profile_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_volunteer_profile_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    role,
    first_name,
    last_name,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    team_club_affiliation_id,
    created_at
  )
  VALUES (
    new.id,
    new.email,
    'volunteer',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'emergency_contact_name', '')), ''),
    NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'emergency_contact_phone', '')), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'team_club_affiliation_id'), '')::uuid,
    now()
  );
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    RETURN new;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
