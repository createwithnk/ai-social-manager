export interface CaptchaConfig { enabled: boolean; siteKey: string; error: string | null }
const setupError = 'Bot verification is misconfigured. Contact the site owner.'
export function readCaptchaConfig(value: unknown, hostname: string, production = false): CaptchaConfig {
  if (value === undefined || value === null || value === '') return { enabled: false, siteKey: '', error: null }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,60}$/.test(value)) return { enabled: true, siteKey: '', error: setupError }
  // Cloudflare reserves 1x/2x/3x keys for test widgets. They never protect a public deployment.
  const testKey = /^[123]x0+/.test(value)
  const local = ['localhost','127.0.0.1','::1','[::1]'].includes(hostname)
  if (testKey && (production || !local)) return { enabled: true, siteKey: '', error: setupError }
  return { enabled: true, siteKey: value, error: null }
}
export function captchaOptions(config: CaptchaConfig, token?: string) {
  if (config.error) throw new Error(config.error)
  if (!config.enabled) return {}
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) throw new Error('Complete bot verification before continuing.')
  return { captchaToken: token.trim() }
}
