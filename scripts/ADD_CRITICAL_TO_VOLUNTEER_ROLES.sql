-- Add critical flag to volunteer_roles for admin organizers to mark must-fill vs nice-to-have roles.
-- Run in Supabase SQL Editor.

ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS critical BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN volunteer_roles.critical IS 'When true, this role is critical and must be filled for the event to run. When false, it is nice-to-have.';
