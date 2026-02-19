-- Add "featured" flag to volunteer_roles. When true, the role can appear in the six featured boxes on the homepage.
-- Run in Supabase SQL Editor.

ALTER TABLE volunteer_roles
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN volunteer_roles.featured IS 'When true, role is shown in the six featured role boxes on the homepage (admin-controlled).';
