-- =============================================================================
-- Run this in your STAGING Supabase project SQL Editor FIRST (before pasting
-- the INSERTs from PROD_EXPORT_DOMAINS_AND_ROLES.sql).
-- This clears volunteer_roles and volunteer_leader_domains so the copied
-- data from production doesn't conflict.
-- =============================================================================

-- Order matters: roles reference domains
DELETE FROM volunteer_roles;
DELETE FROM volunteer_leader_domains;

SELECT 'Staging domains and roles cleared. Paste and run the INSERTs from production export next.' AS status;
