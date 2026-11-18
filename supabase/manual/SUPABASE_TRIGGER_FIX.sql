-- Update the trigger to include first_name and last_name from auth metadata
-- Run this in Supabase SQL Editor

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, first_name, last_name, created_at)
  VALUES (
    new.id,
    new.email,
    'volunteer',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

