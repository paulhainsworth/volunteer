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

await import('../../supabase/functions/send-email/index.ts');
const sendEmail = handler();

Deno.test('xfail MG-09: guardian mail provider failures should redact their downstream response', async () => {
  setClient(() => ({ auth: { getUser: () => ({ data: { user: { id: 'fixture-user' } }, error: null }) } }));
  const providerDetails = 'Synthetic provider diagnostic for guardian@example.invalid';
  const messages: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = () => Promise.resolve(new Response(providerDetails, { status: 500 }));
  console.error = (...args: unknown[]) => { messages.push(args.map(String).join(' ')); };
  try {
    const response = await sendEmail(new Request('https://fixture.invalid/email', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-volunteer-session' },
      body: JSON.stringify({
        to: 'guardian@example.invalid', subject: 'Fixture consent confirmation', html: '<p>Fixture</p>',
      }),
    }));
    equal(response.status, 500);
    // send-email/index.ts:50 forwards and logs the provider body. Require the
    // specific known mismatch so a fix prompts removal of the xfail marker.
    equal((await response.json()).details, providerDetails);
    equal(messages.some((message) => message.includes(providerDetails)), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
