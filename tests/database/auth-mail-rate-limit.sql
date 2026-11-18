BEGIN;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  FOR attempt IN 1..3 LOOP
    IF NOT public.claim_auth_mail_request('login', 'fixture@example.invalid') THEN
      RAISE EXCEPTION 'Expected login mail allowance';
    END IF;
  END LOOP;
  IF public.claim_auth_mail_request('login', 'fixture@example.invalid') THEN
    RAISE EXCEPTION 'Expected the recipient limit to apply';
  END IF;
  IF NOT public.claim_auth_mail_request('welcome', 'fixture@example.invalid') THEN
    RAISE EXCEPTION 'Login and welcome limits should be independent';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_auth_mail_request(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The mail limit operation must be server only';
  END IF;
END
$$;
ROLLBACK;
