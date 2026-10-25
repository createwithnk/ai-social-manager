export function productionHeaders(supabaseUrl) {
  const url = new URL(supabaseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Supabase must be a clean HTTPS origin for release headers.')
  }
  const policy = [
    "default-src 'self'", "script-src 'self'", "frame-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${url.origin} ${url.origin.replace('https:', 'wss:')}`,
    `img-src 'self' blob: data: ${url.origin}`,
    `media-src 'self' blob: ${url.origin}`,
    "font-src 'self'", "object-src 'none'", "base-uri 'none'",
    "frame-ancestors 'none'", "form-action 'self'", 'upgrade-insecure-requests',
  ].join('; ')
  return {
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=()',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
}
