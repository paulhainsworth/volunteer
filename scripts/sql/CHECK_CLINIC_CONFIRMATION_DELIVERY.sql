-- Aggregate only. Allow five minutes for delivery to finish before counting.
SELECT
  count(*) AS registrations,
  count(confirmation_email_sent_at) AS recorded_confirmations,
  count(*) FILTER (WHERE confirmation_email_sent_at IS NULL) AS unrecorded_confirmations
FROM public.kids_clinic_signups
WHERE created_at >= now() - interval '24 hours'
  AND created_at < now() - interval '5 minutes';
