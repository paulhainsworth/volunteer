import { equal } from 'node:assert/strict';
import { handler, request, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key');
await import('../../supabase/functions/create-signup-for-new-user/index.ts');
const signup = handler();

Deno.test('signup rejects a request missing required fields before writing a roster entry', async () => {
  setClient(() => ({
    from() { throw new Error('Roster must not be touched'); },
  }));
  equal((await signup(request({}))).status, 400);
});

Deno.test('a valid new volunteer registration writes one confirmed assignment', async () => {
  const writes: unknown[] = [];
  const volunteerId = '00000000-0000-4000-8000-000000000002';
  const roleId = '00000000-0000-4000-8000-000000000001';
  setClient(() => ({
    from(table: string) {
      if (table === 'volunteer_roles') {
        return { select: () => ({ eq: () => ({ single: () => ({ data: { id: roleId } }) }) }) };
      }
      equal(table, 'signups');
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }) }),
        insert: (row: unknown) => { writes.push(row); return { error: null }; },
      };
    },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json({ created_at: new Date().toISOString() }));
  try {
    const result = await signup(request({ user_id: volunteerId, role_id: roleId }));
    equal(result.status, 200);
    equal(writes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('xfail REL-01: failed reactivation should not report a confirmed signup', async () => {
  const volunteerId = '00000000-0000-4000-8000-000000000002';
  const roleId = '00000000-0000-4000-8000-000000000001';
  let updates = 0;
  setClient(() => ({
    from(table: string) {
      if (table === 'volunteer_roles') {
        return { select: () => ({ eq: () => ({ single: () => ({ data: { id: roleId } }) }) }) };
      }
      equal(table, 'signups');
      return {
        select: () => ({ eq: () => ({ eq: () => ({
          maybeSingle: () => ({ data: { id: 'existing-signup', status: 'cancelled' } }),
        }) }) }),
        update: () => ({ eq: () => {
          updates += 1;
          return { error: { message: 'Fixture reactivation write failed' } };
        } }),
      };
    },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json({ created_at: new Date().toISOString() }));
  try {
    const result = await signup(request({ user_id: volunteerId, role_id: roleId }));
    equal(updates, 1);
    // REL-01: index.ts:112–121 ignores the failed update and index.ts:169 returns success.
    equal(result.status, 200, 'Expected false-success regression changed. Remove xfail and assert failure.');
    equal((await result.json()).ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('xfail REL-01: failed guardian waiver write should prevent signup confirmation', async () => {
  const volunteerId = '00000000-0000-4000-8000-000000000002';
  const roleId = '00000000-0000-4000-8000-000000000001';
  let waiverWrites = 0;
  setClient(() => ({
    from(table: string) {
      if (table === 'volunteer_roles') {
        return { select: () => ({ eq: () => ({ single: () => ({ data: { id: roleId } }) }) }) };
      }
      if (table === 'waiver_settings') {
        return { select: () => ({ single: () => ({ data: { version: 1, waiver_text: 'Fixture waiver' } }) }) };
      }
      if (table === 'waivers') {
        return { insert: () => {
          waiverWrites += 1;
          return { error: { message: 'Fixture waiver write failed' } };
        } };
      }
      equal(table, 'signups');
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }) }),
        insert: () => ({ error: null }),
      };
    },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json({ created_at: new Date().toISOString() }));
  try {
    const result = await signup(request({
      user_id: volunteerId,
      role_id: roleId,
      waiver_minor: true,
      parent_guardian_name: 'Test Guardian',
      parent_guardian_email: 'parent@example.invalid',
      parent_signature_name: 'Test Guardian',
      volunteer_signature_name: 'Test Volunteer',
    }));
    equal(waiverWrites, 1);
    // REL-01: index.ts:152–171 logs the failed waiver write and returns success.
    equal(result.status, 200, 'Expected waiver regression changed. Remove xfail and assert failure.');
    equal((await result.json()).ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
