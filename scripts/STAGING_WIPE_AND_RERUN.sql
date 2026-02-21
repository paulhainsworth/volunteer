-- Wipe staging schema so you can re-run STAGING_APPLY_ALL.sql
-- Run this in the staging Supabase SQL Editor ONCE, then run scripts/STAGING_APPLY_ALL.sql

-- Drop tables (order respects foreign keys)
DROP TABLE IF EXISTS signups CASCADE;
DROP TABLE IF EXISTS waivers CASCADE;
DROP TABLE IF EXISTS emails_sent CASCADE;
DROP TABLE IF EXISTS volunteer_roles CASCADE;
DROP TABLE IF EXISTS volunteer_leader_domains CASCADE;
DROP TABLE IF EXISTS volunteer_contacts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS team_club_affiliations CASCADE;
DROP TABLE IF EXISTS waiver_settings CASCADE;

-- Drop functions (triggers are dropped with tables)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.get_dashboard_stats() CASCADE;
DROP FUNCTION IF EXISTS public.get_confirmed_signup_counts(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.link_volunteer_contact_on_profile_insert() CASCADE;
DROP FUNCTION IF EXISTS public.link_volunteer_contact_on_profile_update() CASCADE;

SELECT 'Staging schema wiped. Now run scripts/STAGING_APPLY_ALL.sql' AS status;
