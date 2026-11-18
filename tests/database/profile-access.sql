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
