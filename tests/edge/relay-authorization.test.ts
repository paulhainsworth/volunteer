import { equal } from 'node:assert/strict';
import { handler, setClient } from './stubs.ts';

Deno.env.set('SEND_EMAIL_STAFF_ONLY', 'true');
await import('../../supabase/functions/send-email/index.ts');
const relay = handler();

function message(authorization?: string) {
  return new Request('https://fixture.invalid/send-email', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    body: JSON.stringify({ to: 'fixture@example.invalid', subject: 'Fixture', html: '<p>Fixture</p>' }),
  });
}

Deno.test('generic email requires a session', async () => {
  equal((await relay(message())).status, 401);
});

Deno.test('staff-only mode allows organizer delivery', async () => {
  setClient(() => ({
    auth: { getUser: () => ({ data: { user: { id: 'fixture-admin' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { role: 'admin' } }) }) }) }),
  }));
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(Response.json({ id: 'fixture-message' }));
    const response = await relay(message('Bearer synthetic-organizer-session'));
    equal(response.status, 200);
    equal((await response.json()).success, true);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

Deno.test('staff-only mode refuses volunteer relay requests', async () => {
  setClient(() => ({
    auth: { getUser: () => ({ data: { user: { id: 'fixture-volunteer' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { role: 'volunteer' } }) }) }) }),
  }));
  equal((await relay(message('Bearer synthetic-volunteer-session'))).status, 403);
});
