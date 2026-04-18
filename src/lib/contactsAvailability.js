/**
 * Volunteer contacts directory (/contacts): shown only through 11:59:59.999 PM PDT April 19, 2026.
 * After that instant, the route redirects to home and is not discoverable at the same URL.
 */
export const CONTACTS_FEATURE_END_MS = new Date('2026-04-19T23:59:59.999-07:00').getTime();

export function isContactsFeatureAvailable(nowMs = Date.now()) {
  return nowMs <= CONTACTS_FEATURE_END_MS;
}
