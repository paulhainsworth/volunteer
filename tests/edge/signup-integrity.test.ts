import { deepStrictEqual, equal } from 'node:assert/strict';
import { handler, request, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_ANON_KEY', 'synthetic-anon-key');
await import('../../supabase/functions/create-signup-for-new-user/index.ts');
const signup = handler();

const roleId = '00000000-0000-4000-8000-000000000001';
const user = { id: '00000000-0000-4000-8000-000000000002' };

function authenticatedRequest() {
  return new Request('https://fixture.invalid/function', {
    method: 'POST',
    headers: { Authorization: 'Bearer synthetic-session' },
    body: JSON.stringify({ role_id: roleId }),
  });
}

Deno.test('legacy signup requires a session before calling Supabase', async () => {
  equal((await signup(request({ role_id: roleId }))).status, 401);
});

Deno.test('legacy signup rejects an expired session without assigning a seat', async () => {
  setClient(() => ({
    auth: { getUser: () => ({ data: { user: null }, error: new Error('Expired session') }) },
    rpc() { throw new Error('Roster must not be touched'); },
  }));
  equal((await signup(authenticatedRequest())).status, 401);
});

Deno.test('legacy signup confirms through the authenticated database operation', async () => {
  setClient((_url, key) => ({
    auth: { getUser: () => ({ data: { user }, error: null }) },
    rpc(name: string, args: object) {
      equal(key, 'synthetic-anon-key');
      equal(name, 'confirm_volunteer_signup');
      deepStrictEqual(args, { p_role_id: roleId, p_phone: null });
      return { error: null };
    },
  }));
  equal((await signup(authenticatedRequest())).status, 200);
});

Deno.test('legacy signup reports a rejected database write as failure', async () => {
  setClient(() => ({
    auth: { getUser: () => ({ data: { user }, error: null }) },
    rpc: () => ({ error: { message: 'Current waiver required' } }),
  }));
  const result = await signup(authenticatedRequest());
  equal(result.status, 409);
  deepStrictEqual(await result.json(), { error: 'Current waiver required' });
});
