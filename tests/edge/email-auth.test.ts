import { equal } from 'node:assert/strict';
import { handler, request, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key');
Deno.env.set('RESEND_API_KEY', 'synthetic-mail-key');
await import('../../supabase/functions/send-magic-link/index.ts');
const sendLogin = handler();

Deno.test('a valid public login request sends a single configured confirmation', async () => {
  const email = 'volunteer@example.invalid';
  const redirectTo = 'http://127.0.0.1:4179/';
  let delivery = 0;
  setClient(() => ({
    auth: { admin: { generateLink: (options: { email: string }) => {
      equal(options.email, email);
      return { data: { properties: { action_link: 'https://fixture.invalid/link' } }, error: null };
    } } },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    delivery += 1;
    equal(JSON.parse(init?.body as string).to[0], email);
    return Promise.resolve(Response.json({ id: 'fixture-email' }));
  };
  try {
    equal((await sendLogin(request({ to: email, redirectTo }))).status, 200);
    equal(delivery, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('a malformed login request is rejected before using providers', async () => {
  setClient(() => { throw new Error('Auth provider must not be used'); });
  equal((await sendLogin(request({}))).status, 400);
});

Deno.test('volunteer accounts cannot use the organizer-only link preparation action', async () => {
  setClient(() => ({
    auth: {
      getUser: () => ({ data: { user: { id: 'fixture-user' } }, error: null }),
      admin: { generateLink() { throw new Error('Auth link must not be generated'); } },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: { role: 'volunteer' } }) }) }) }),
  }));
  const result = await sendLogin(new Request('https://fixture.invalid/function', {
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-volunteer-session' },
    body: JSON.stringify({ to: 'volunteer@example.invalid', redirectTo: 'http://127.0.0.1:4179/', sendEmail: false }),
  }));
  equal(result.status, 403);
});
