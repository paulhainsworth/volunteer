-- Allow admins and volunteer leaders to update signup rows, which the admin
-- volunteer editor uses to mark a signup as cancelled when removing someone.

DROP POLICY IF EXISTS "Volunteers can update own signups" ON public.signups;
DROP POLICY IF EXISTS "Users, admins, or leaders can update signups" ON public.signups;

CREATE POLICY "Users, admins, or leaders can update signups"
  ON public.signups FOR UPDATE
  USING (
    volunteer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.volunteer_roles vr
      LEFT JOIN public.volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
        AND (
          vr.leader_id = auth.uid()
          OR vld.leader_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    volunteer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.volunteer_roles vr
      LEFT JOIN public.volunteer_leader_domains vld ON vr.domain_id = vld.id
      WHERE vr.id = signups.role_id
        AND (
          vr.leader_id = auth.uid()
          OR vld.leader_id = auth.uid()
        )
    )
  );
