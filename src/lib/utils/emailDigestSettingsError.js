/**
 * Maps Supabase/PostgREST errors for missing email_digest_settings to an actionable message.
 */
export function friendlyEmailDigestSettingsError(err, fallback = 'Could not load email settings') {
  const msg = err?.message != null ? String(err.message) : String(err || '');
  if (
    /email_digest_settings|PGRST205|schema cache|42P01|does not exist/i.test(msg)
  ) {
    return (
      'This environment’s database is missing the email_digest_settings table. ' +
      'In Supabase Dashboard → SQL Editor (for the same project as this site), run the script ' +
      'supabase/migrations/20260420120000_admin_daily_summary_email_toggle.sql from the repository, then refresh this page.'
    );
  }
  return msg.trim() || fallback;
}
