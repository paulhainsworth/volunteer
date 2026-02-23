import { supabase } from './supabaseClient';

/**
 * Notify Slack (bbccommunity) when a volunteer signs up for a role.
 * Call after any successful signup creation. Fire-and-forget; logs errors.
 * @param {{ role_id: string, role_name?: string, volunteer_id?: string, volunteer_name?: string, volunteer_email?: string }} payload
 */
export async function notifySlackSignup(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    console.warn('notifySlackSignup: no session, skipping')
    return
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/notify-slack-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn('notifySlackSignup failed:', res.status, err)
    }
  } catch (e) {
    console.warn('notifySlackSignup error:', e)
  }
}
