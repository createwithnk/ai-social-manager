import { readCaptchaConfig } from '../src/lib/captcha.ts'

export function productionHeaders({supabaseUrl,turnstileSiteKey} = {}) {
  const connections = new Set(["'self'"])
  const media = new Set(["'self'",'blob:','data:'])
  if (supabaseUrl) {
    const url = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Production Supabase URL must be a clean HTTPS origin.')
    connections.add(url.origin);media.add(url.origin)
    connections.add(url.origin.replace('https:','wss:'))
  }
  const captcha = readCaptchaConfig(turnstileSiteKey,'production.invalid',true)
  if (captcha.error) throw new Error(captcha.error)
  const challengeOrigin = 'https://challenges.cloudflare.com'
  const policy = [
    `default-src 'self'`,
    `script-src 'self'${captcha.enabled ? ` ${challengeOrigin}` : ''}`,
    `frame-src ${captcha.enabled ? challengeOrigin : "'none'"}`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src ${[...connections].join(' ')}`,
    `img-src ${[...media].join(' ')}`,
    `media-src ${[...media].join(' ')}`,
    `font-src 'self'`,`object-src 'none'`,`base-uri 'none'`,
    `frame-ancestors 'none'`,`form-action 'self'`,`upgrade-insecure-requests`,
  ].join('; ')
  return {'Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=(), geolocation=(), payment=()','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000; includeSubDomains','Cross-Origin-Opener-Policy':'same-origin'}
}
