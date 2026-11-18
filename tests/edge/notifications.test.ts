import { equal, match } from 'node:assert/strict';
import { handler, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key');
Deno.env.set('RESEND_API_KEY', 'synthetic-mail-key');
Deno.env.delete('DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL');
await import('../../supabase/functions/send-daily-admin-summary/index.ts');
const summarize = handler();

Deno.test('an authorized invocation respects a disabled daily summary', async () => {
  setClient(() => ({
    from(table: string) {
      equal(table, 'email_digest_settings');
      return { select: () => ({ eq: () => ({
        maybeSingle: () => ({ data: { admin_daily_volunteer_summary_enabled: false }, error: null }),
      }) }) };
    },
  }));
  const response = await summarize(new Request('https://fixture.invalid/summary', {
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-service-key' },
    body: '{}',
  }));
  equal(response.status, 200);
  const body = await response.json();
  equal(body.skipped, true);
  match(body.reason, /disabled/i);
});
