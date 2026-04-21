/**
 * Supabase appends #access_token=… to redirectTo. If redirectTo is origin/#/auth/callback,
 * the browser URL becomes #/auth/callback#access_token=… which breaks detectSessionInUrl and
 * routing. Collapse to a single fragment: #access_token=… (legacy-compatible).
 *
 * Uses location.replace so the document loads once with the canonical hash (replaceState alone
 * was unreliable in some embedded / devtools browsers).
 */
if (typeof window !== 'undefined') {
  const h = window.location.hash;
  if (h.startsWith('#/auth/callback#')) {
    const tail = h.slice('#/auth/callback#'.length);
    if (tail.includes('access_token=') || tail.includes('type=')) {
      const next = window.location.pathname + window.location.search + '#' + tail;
      window.location.replace(window.location.origin + next);
    }
  }
}
