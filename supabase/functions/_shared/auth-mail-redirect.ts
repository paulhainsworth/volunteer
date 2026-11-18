export function allowedMailRedirect(value: unknown, allowWaiver: boolean): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const allowed = (Deno.env.get('AUTH_MAIL_ALLOWED_ORIGINS') || 'https://volunteer.berkeleyomnium.com')
      .split(',')
      .map((origin) => origin.trim())
    if (!allowed.includes(url.origin) || !['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password || url.hash || url.pathname !== '/') return null
    if (url.search && !(allowWaiver && url.search === '?post_login=waiver')) return null
    return url.href
  } catch {
    return null
  }
}
