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

Deno.test('volunteer notification uses trusted activity fields and private individual deliveries', async () => {
  const reference = '00000000-0000-4000-8000-000000000081';
  const deliveries: { to: string[]; html: string }[] = [];
  setClient(() => ({
    auth: { getUser: () => ({ data: { user: { id: 'fixture-volunteer' } } }) },
    rpc(name: string, fields: Record<string, unknown>) {
      equal(name, 'claim_volunteer_mail');
      equal(fields.p_volunteer, 'fixture-volunteer');
      equal(fields.p_kind, 'guardian_signup');
      equal(fields.p_reference, reference);
      return { data: {
        recipients: ['guardian@example.invalid', 'fixture@example.invalid'],
        volunteerName: 'Fixture & Volunteer',
        guardianName: 'Fixture <Guardian>',
        roleName: 'Course Marshal', roleId: reference, roleDate: '2099-04-18',
      } };
    },
  }));
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = (_url, init) => {
      deliveries.push(JSON.parse(init?.body as string));
      return Promise.resolve(Response.json({ id: 'fixture-message' }));
    };
    const response = await relay(new Request('https://fixture.invalid/send-email', {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-volunteer-session' },
      body: JSON.stringify({
        notification: { kind: 'guardian_signup', reference },
      }),
    }));
    equal(response.status, 200);
    equal(deliveries.length, 2);
    equal(deliveries[0].to.length, 1);
    equal(deliveries[1].to.length, 1);
    equal(deliveries[0].to[0], 'guardian@example.invalid');
    equal(deliveries[0].html.includes('Fixture &amp; Volunteer'), true);
    equal(deliveries[0].html.includes('Fixture &lt;Guardian&gt;'), true);
    equal(deliveries[0].html.includes('April 18, 2099'), true);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
