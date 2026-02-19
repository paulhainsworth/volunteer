-- Fix: "Database error creating new user" caused by link_volunteer_contact trigger
-- When Auth creates a user, the session has no auth.uid(), so the UPDATE on
-- volunteer_contacts is blocked by RLS and the whole transaction fails.
-- This makes the link trigger best-effort: it never aborts profile creation.
-- Run this in Supabase SQL Editor, then try adding the leader again.

CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE volunteer_contacts
  SET profile_id = NEW.id
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND profile_id IS NULL;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail auth user creation; contact can be linked later
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same for the update trigger (in case profile email is set/updated in same context)
CREATE OR REPLACE FUNCTION link_volunteer_contact_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS DISTINCT FROM NEW.email OR OLD.email IS NULL) THEN
    UPDATE volunteer_contacts
    SET profile_id = NEW.id
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
      AND profile_id IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Link triggers are now fault-tolerant. Try adding the leader again.' AS status;
