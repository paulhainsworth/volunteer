-- Fix: Public (unlogged-in) volunteer page shows 0/N filled because RLS blocks
-- anonymous reads on signups. This adds an RPC that returns only role_id + count
-- (no volunteer data), callable by anyone, so the public page can show correct counts.
-- Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.get_confirmed_signup_counts(role_ids uuid[])
RETURNS TABLE(role_id uuid, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.role_id, COUNT(*)::bigint
  FROM signups s
  WHERE s.status = 'confirmed'
    AND s.role_id = ANY(role_ids)
  GROUP BY s.role_id;
$$;

COMMENT ON FUNCTION public.get_confirmed_signup_counts(uuid[]) IS
  'Returns confirmed signup count per role. Callable by anon/authenticated so public volunteer page can show correct fill counts without reading signups table.';

-- Allow anyone (anon + authenticated) to call it
GRANT EXECUTE ON FUNCTION public.get_confirmed_signup_counts(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_confirmed_signup_counts(uuid[]) TO authenticated;

SELECT 'get_confirmed_signup_counts RPC added. Redeploy app so roles store uses it.' AS status;
