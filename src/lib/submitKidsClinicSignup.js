/**
 * @param {object} payload
 * @param {string} payload.parent_first_name
 * @param {string} payload.parent_last_name
 * @param {string} payload.parent_email
 * @param {string} payload.child_name
 * @param {string} payload.child_gender
 * @param {number} payload.child_age
 * @param {boolean} payload.waiver_consent
 */
export async function submitKidsClinicSignup(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing Supabase configuration.');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/submit-kids-clinic-signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not submit signup.');
  }
  return data;
}
