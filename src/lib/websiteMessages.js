import { supabasePublic } from './supabasePublic';

const fields = 'event_year,opportunities_message,homepage_thanks,onboarding_title,onboarding_message,revision';

export const defaultWebsiteMessages = {
  event_year: null,
  opportunities_message: 'Thanks for volunteering at the Berkeley Omnium! Please consider taking one of the remaining critical shifts.',
  homepage_thanks: 'Every shift helps make the races possible. Thank you for giving your time and helping more East Bay students ride and race.',
  onboarding_title: 'Welcome to the Berkeley Omnium!',
  onboarding_message: 'Thank you for volunteering to help make this event a success!',
};

export function formatWebsiteMessage(message, year) {
  return message.replaceAll('{year}', String(year));
}

export async function readWebsiteMessages() {
  const { data, error } = await supabasePublic
    .from('website_messages')
    .select(fields)
    .eq('id', 1)
    .abortSignal(AbortSignal.timeout(5000))
    .single();

  if (error || !data) throw error ?? new Error('Website messages are missing');
  return data;
}

export async function loadPublishedWebsiteMessages() {
  try {
    return await readWebsiteMessages();
  } catch {
    return defaultWebsiteMessages;
  }
}

export async function saveWebsiteMessages(client, messages) {
  const { revision, ...values } = messages;
  const { data, error } = await client
    .from('website_messages')
    .update(values)
    .eq('id', 1)
    .eq('revision', revision)
    .abortSignal(AbortSignal.timeout(10000))
    .select(fields)
    .maybeSingle();

  if (error) throw error;
  return data;
}
