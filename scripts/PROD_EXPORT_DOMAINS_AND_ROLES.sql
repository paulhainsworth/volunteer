-- =============================================================================
-- Run this in your PRODUCTION Supabase project SQL Editor.
-- It outputs INSERT statements for volunteer_leader_domains and volunteer_roles.
-- Copy the entire result (one or two text cells), then run it in STAGING
-- after running scripts/STAGING_CLEAR_DOMAINS_AND_ROLES.sql.
-- =============================================================================

-- Domains: same IDs as prod, but leader_id = NULL (no profile in staging)
SELECT string_agg(sql, E'\n' ORDER BY ord, sort2) AS copy_this_into_staging
FROM (
  SELECT 1 AS ord, created_at AS sort2,
    'INSERT INTO volunteer_leader_domains (id, name, description, leader_id, created_at, updated_at) VALUES (' ||
    quote_literal(id::text) || ', ' ||
    quote_literal(name) || ', ' ||
    COALESCE(quote_literal(description), 'NULL') || ', NULL, ' ||
    quote_literal(created_at::text) || ', ' ||
    quote_literal(updated_at::text) || ');' AS sql
  FROM volunteer_leader_domains
  UNION ALL
  -- Roles: same IDs and domain_id; created_by and leader_id = NULL
  SELECT 2 AS ord, created_at AS sort2,
    'INSERT INTO volunteer_roles (id, name, description, event_date, start_time, end_time, location, positions_total, created_by, created_at, updated_at, leader_id, domain_id, featured, estimate_duration_hours, event) VALUES (' ||
    quote_literal(id::text) || ', ' ||
    quote_literal(name) || ', ' ||
    COALESCE(quote_literal(description), 'NULL') || ', ' ||
    COALESCE(quote_literal(event_date::text), 'NULL') || ', ' ||
    COALESCE(quote_literal(start_time::text), 'NULL') || ', ' ||
    COALESCE(quote_literal(end_time::text), 'NULL') || ', ' ||
    COALESCE(quote_literal(location), 'NULL') || ', ' ||
    COALESCE(positions_total::text, '1') || ', NULL, ' ||
    quote_literal(created_at::text) || ', ' ||
    quote_literal(updated_at::text) || ', NULL, ' ||
    COALESCE(quote_literal(domain_id::text), 'NULL') || ', ' ||
    COALESCE(featured::text, 'false') || ', ' ||
    COALESCE(quote_literal(estimate_duration_hours::text), 'NULL') || ', ' ||
    COALESCE(quote_literal(event), 'NULL') || ');' AS sql
  FROM volunteer_roles
) t;
