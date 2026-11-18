import { deepStrictEqual, equal } from 'node:assert/strict';
import { handler, request, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key');
Deno.env.set('RESEND_API_KEY', 'synthetic-mail-key');
await import('../../supabase/functions/submit-kids-clinic-signup/index.ts');
const register = handler();
const registration = {
  parent_first_name: 'Test',
  parent_last_name: 'Parent',
  parent_email: 'parent@example.invalid',
  child_name: 'Test Child',
  child_gender: 'prefer_not_to_say',
  child_age: 10,
  waiver_consent: true,
};

Deno.test('clinic requires explicit consent before contacting storage', async () => {
  setClient(() => { throw new Error('Storage must not be used'); });
  for (const consent of [false, 'false', null]) {
    equal((await register(request({ ...registration, waiver_consent: consent }))).status, 400);
  }
});

Deno.test('clinic preserves acceptance when the mail provider rejects or times out', async () => {
  setClient(() => ({
    rpc(name: string) {
      equal(name, 'reserve_clinic_registration');
      return { data: { id: 'registration', created: true, emailSent: false } };
    },
  }));
  const originalFetch = globalThis.fetch;
  try {
    for (const delivery of [
      () => Promise.resolve(new Response(null, { status: 503 })),
      () => Promise.reject(new Error('Fixture timeout')),
    ]) {
      globalThis.fetch = delivery;
      const result = await register(request(registration));
      equal(result.status, 200);
      deepStrictEqual(await result.json(), { success: true, emailSent: false });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('clinic reports a rejected write and rate limiting separately', async () => {
  setClient(() => ({ rpc: () => ({ error: { code: 'Fixture storage unavailable' } }) }));
  equal((await register(request(registration))).status, 500);
  setClient(() => ({ rpc: () => ({ data: { limited: true } }) }));
  equal((await register(request(registration))).status, 429);
});

Deno.test('clinic retry preserves delivery status and does not send another email', async () => {
  let created = true;
  let sent = false;
  let deliveries = 0;
  setClient(() => ({
    rpc: () => {
      const result = { id: 'registration', created, emailSent: sent };
      created = false;
      return { data: result };
    },
    from: () => ({
      update: () => ({ eq: () => { sent = true; return { error: null }; } }),
    }),
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    deliveries += 1;
    return Promise.resolve(Response.json({ id: 'fixture-email' }));
  };
  try {
    for (let index = 0; index < 2; index += 1) {
      const result = await register(request(registration));
      equal(result.status, 200);
      deepStrictEqual(await result.json(), { success: true, emailSent: true });
    }
    equal(deliveries, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
