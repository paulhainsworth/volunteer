INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000001', 'volunteer@example.invalid');
GRANT SELECT, UPDATE ON profiles TO authenticated;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
UPDATE profiles SET first_name = 'Updated' WHERE id = auth.uid();
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM profiles WHERE id = auth.uid() AND first_name = 'Updated') THEN
    RAISE EXCEPTION 'Own-profile edit did not persist';
  END IF;
END
$$;
ROLLBACK;

-- MG-08: the standalone page can save complete consent for the signed-in volunteer.
-- The SQL policy scopes the row to a volunteer. The schema has no minor status
-- or guardian completeness constraint, so age-dependent enforcement needs a policy decision.
GRANT INSERT ON waivers TO authenticated;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
INSERT INTO waivers (volunteer_id, signature_name, waiver_version, waiver_text,
  parent_guardian_name, parent_guardian_email, parent_signature_name, parent_signed_at)
VALUES (auth.uid(), 'Fixture Volunteer', 1, 'Fixture waiver',
  'Fixture Guardian', 'guardian@example.invalid', 'Fixture Guardian', now());
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM waivers
      WHERE volunteer_id = '00000000-0000-4000-8000-000000000001'
        AND parent_guardian_email = 'guardian@example.invalid' AND parent_signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Own guardian waiver did not persist';
  END IF;
END
$$;
ROLLBACK;
