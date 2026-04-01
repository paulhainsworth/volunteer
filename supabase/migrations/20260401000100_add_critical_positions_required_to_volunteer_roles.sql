ALTER TABLE public.volunteer_roles
ADD COLUMN IF NOT EXISTS critical_positions_required INTEGER NOT NULL DEFAULT 0;

UPDATE public.volunteer_roles
SET critical_positions_required = CASE
  WHEN critical THEN positions_total
  ELSE 0
END
WHERE critical_positions_required = 0;

UPDATE public.volunteer_roles
SET critical_positions_required = GREATEST(
  0,
  LEAST(COALESCE(critical_positions_required, 0), COALESCE(positions_total, 0))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_roles_critical_positions_required_check'
  ) THEN
    ALTER TABLE public.volunteer_roles
    ADD CONSTRAINT volunteer_roles_critical_positions_required_check
    CHECK (critical_positions_required >= 0 AND critical_positions_required <= positions_total);
  END IF;
END $$;

UPDATE public.volunteer_roles
SET critical = (critical_positions_required > 0);

COMMENT ON COLUMN public.volunteer_roles.critical_positions_required IS 'Number of spots in this role that are considered critical to fill. 0 means nice-to-have only.';
