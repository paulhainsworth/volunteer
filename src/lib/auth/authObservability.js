/**
 * Client-side auth lifecycle breadcrumbs for debugging (Phase 1).
 * Extend later with analytics or session replay correlation ids.
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
export function authObs(event, detail = {}) {
  if (import.meta.env?.DEV) {
    console.debug('[authObs]', event, detail);
  }
}
