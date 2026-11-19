CREATE TABLE public.website_messages (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  event_year integer NOT NULL CHECK (event_year BETWEEN 2000 AND 2100),
  opportunities_message text NOT NULL CHECK (char_length(opportunities_message) <= 1000),
  homepage_thanks text NOT NULL CHECK (char_length(homepage_thanks) <= 1000),
  onboarding_title text NOT NULL CHECK (char_length(btrim(onboarding_title)) BETWEEN 1 AND 120),
  onboarding_message text NOT NULL CHECK (char_length(onboarding_message) <= 1000),
  revision integer NOT NULL DEFAULT 1
);

INSERT INTO public.website_messages
  (event_year, opportunities_message, homepage_thanks, onboarding_title, onboarding_message)
VALUES (
  2026,
  'Thanks for volunteering at the {year} Berkeley Omnium! Please consider taking one of the remaining critical shifts. Your time helps us put on both races and support East Bay youth cycling.',
  'Every shift helps make the races possible. Thank you for giving your time and helping more East Bay students ride and race.',
  'Welcome to the {year} Berkeley Omnium!',
  'Thank you for volunteering to help make this event a success!'
);

ALTER TABLE public.website_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.website_messages TO anon, authenticated;
GRANT UPDATE (event_year, opportunities_message, homepage_thanks, onboarding_title, onboarding_message)
  ON public.website_messages TO authenticated;

CREATE POLICY "Anyone can read published website messages"
  ON public.website_messages FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Administrators can edit website messages"
  ON public.website_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE FUNCTION public.advance_website_messages_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_website_messages_revision() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER advance_website_messages_revision
  BEFORE UPDATE ON public.website_messages
  FOR EACH ROW EXECUTE FUNCTION public.advance_website_messages_revision();
