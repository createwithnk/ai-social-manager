import { readCaptchaConfig } from './captcha'
export const captchaConfig = readCaptchaConfig(import.meta.env.VITE_TURNSTILE_SITE_KEY, window.location.hostname, import.meta.env.PROD)
