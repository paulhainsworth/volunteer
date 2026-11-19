import { deepEqual, equal, match } from 'node:assert/strict';
import { handler, setClient } from './stubs.ts';

Deno.env.set('SUPABASE_URL', 'https://fixture.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key');
Deno.env.set('RESEND_API_KEY', 'synthetic-mail-key');

await import('../../supabase/functions/send-nica-coach-digest/index.ts');
const sendDigest = handler();

Deno.test('NICA coach digest uses managed affiliation IDs and the saved beneficiary label', async () => {
  setClient(() => ({
    from(table: string) {
      switch (table) {
        case 'email_digest_settings':
          return { select: () => ({ eq: () => ({ maybeSingle: () => ({ data: {}, error: null }) }) }) };
        case 'team_club_affiliations':
          return { select: () => ({ data: [{ id: 'fixture-team', name: 'Renamed Club' }], error: null }) };
        case 'nica_beneficiaries':
          return { select: () => ({ data: [{
            label: 'Managed Team', nica_beneficiary_affiliations: [{ affiliation_id: 'fixture-team' }, { affiliation_id: 'other-team' }],
          }], error: null }) };
        case 'nica_coaches':
          return { select: () => ({ gte: () => ({ data: [{
            id: 'fixture-coach', email: 'coach@example.invalid', team_club_affiliation_id: 'fixture-team', email_end_date: '2099-04-18',
          }], error: null }) }) };
        case 'nica_coach_digest_runs':
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }) }),
            insert: () => ({ error: null }),
          };
        case 'profiles':
          return { select: () => ({ in: (column: string, ids: string[]) => {
            equal(column, 'team_club_affiliation_id');
            deepEqual(ids, ['fixture-team', 'other-team']);
            return { data: [], error: null };
          } }) };
        default:
          throw Error(`Unexpected table ${table}`);
      }
    },
  }));

  const originalFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async (url, options) => {
    equal(url, 'https://api.resend.com/emails');
    const message = JSON.parse(String(options?.body));
    deepEqual(message.to, ['coach@example.invalid']);
    match(message.subject, /Managed Team/);
    match(message.attachments[0].filename, /Managed-Team/i);
    sent += 1;
    return new Response('{}');
  };
  try {
    const response = await sendDigest(new Request('https://fixture.invalid/digest', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-service-key' },
      body: JSON.stringify({ force: true }),
    }));
    equal(response.status, 200);
    equal((await response.json()).sent, 1);
    equal(sent, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
