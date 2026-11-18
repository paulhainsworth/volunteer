CREATE TABLE public.auth_mail_rate_limits (
  channel text NOT NULL,
  recipient_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL,
  PRIMARY KEY (channel, recipient_key)
);
ALTER TABLE public.auth_mail_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_mail_rate_limits FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_auth_mail_request(p_channel text, p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  bucket timestamptz := date_bin(interval '15 minutes', clock_timestamp(), timestamptz '2000-01-01 00:00:00+00');
  recipient text := encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
  allowed_count integer;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('login', 'welcome') OR p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 254 THEN
    RETURN false;
  END IF;

  INSERT INTO public.auth_mail_rate_limits AS limits VALUES (p_channel, 'global', bucket, 1)
  ON CONFLICT (channel, recipient_key) DO UPDATE
  SET window_start = bucket,
      request_count = CASE WHEN limits.window_start = bucket THEN limits.request_count + 1 ELSE 1 END
  WHERE limits.window_start < bucket OR (limits.window_start = bucket AND limits.request_count < 120)
  RETURNING request_count INTO allowed_count;
  IF NOT FOUND THEN RETURN false; END IF;

  IF allowed_count = 1 THEN
    DELETE FROM public.auth_mail_rate_limits
    WHERE channel = p_channel AND window_start < bucket - interval '24 hours';
  END IF;

  INSERT INTO public.auth_mail_rate_limits AS limits VALUES (p_channel, recipient, bucket, 1)
  ON CONFLICT (channel, recipient_key) DO UPDATE
  SET window_start = bucket,
      request_count = CASE WHEN limits.window_start = bucket THEN limits.request_count + 1 ELSE 1 END
  WHERE limits.window_start < bucket OR (limits.window_start = bucket AND limits.request_count < 3);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_auth_mail_request(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auth_mail_request(text, text) TO service_role;
