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

Deno.test('clinic rejects invalid consent before contacting storage', async () => {
  setClient(() => { throw new Error('Storage must not be used'); });
  equal((await register(request({ ...registration, waiver_consent: false }))).status, 400);
});

Deno.test('clinic preserves accepted registration when the mail provider rejects delivery', async () => {
  const rows: unknown[] = [];
  setClient(() => ({
    from(table: string) {
      equal(table, 'kids_clinic_signups');
      return { insert: (row: unknown) => { rows.push(row); return { error: null }; } };
    },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json({ message: 'Fixture provider unavailable' }, { status: 503 }));
  try {
    const result = await register(request(registration));
    equal(result.status, 200);
    equal(rows.length, 1);
    deepStrictEqual(await result.json(), { success: true, emailSent: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('clinic reports a rejected insert as a failed registration', async () => {
  setClient(() => ({ from: () => ({ insert: () => ({ error: { message: 'Fixture storage unavailable' } }) }) }));
  equal((await register(request(registration))).status, 500);
});

Deno.test('xfail SEC-08: submitting the same accepted registration twice should save one row', async () => {
  const rows: unknown[] = [];
  setClient(() => ({
    from: () => ({ insert: (row: unknown) => { rows.push(row); return { error: null }; } }),
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json({ id: 'fixture-email' }));
  try {
    equal((await register(request(registration))).status, 200);
    const retryStatus = (await register(request(registration))).status;
    // SEC-08: the clinic handler inserts on every POST at index.ts:143, without a retry key.
    // Require this specific known mismatch. Unexpected errors and an unexpected pass fail the test.
    equal(rows.length, 2, 'Expected duplicate-write regression changed. Remove xfail and assert one row.');
    equal(retryStatus, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
