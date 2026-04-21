-- Optional event date/times; month-only completion window; display as "Flexible" when unscheduled.
ALTER TABLE public.volunteer_roles
  ALTER COLUMN event_date DROP NOT NULL,
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time DROP NOT NULL;

ALTER TABLE public.volunteer_roles
  ADD COLUMN IF NOT EXISTS completion_month date;

COMMENT ON COLUMN public.volunteer_roles.completion_month IS
  'First day of the calendar month when the role should be completed (no specific day). Used when event_date is null.';

CREATE INDEX IF NOT EXISTS idx_volunteer_roles_completion_month ON public.volunteer_roles (completion_month);
