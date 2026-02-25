/**
 * Notify Slack when a volunteer is assigned to a role (e.g. admin-add flow).
 * Calls the notify-slack-signup edge function if deployed; no-ops otherwise.
 */
import { supabase } from './supabaseClient';

/**
 * @param {{ role_id: string, volunteer_id: string, volunteer_name?: string, volunteer_email?: string }} opts
 * @returns {Promise<void>}
 */
export async function notifySlackSignup(opts) {
  try {
    await supabase.functions.invoke('notify-slack-signup', { body: opts });
  } catch (_) {
    // Edge function may not be deployed; don't break volunteer creation
  }
}
