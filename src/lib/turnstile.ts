export interface TurnstileApi {
  ready: (callback: () => void) => void
  render: (element: HTMLElement, options: {
    sitekey: string; action: string; language: string; size: 'compact'; theme: 'light';
    'response-field': false; retry: 'never';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
    'timeout-callback': () => void;
  }) => string
  remove: (widget: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }
let pending: Promise<TurnstileApi> | null = null
const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function loadTurnstile(): Promise<TurnstileApi> {
  if (pending) return pending
  pending = new Promise<TurnstileApi>((resolve,reject) => {
    const script = document.createElement('script')
    let settled = false
    let ownedApi: TurnstileApi | undefined
    const fail = () => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (script.isConnected && ownedApi && window.turnstile === ownedApi) delete window.turnstile
      script.remove()
      reject(new Error('Bot verification could not load. Retry verification.'))
    }
    const timer = setTimeout(fail,15_000)
    const accept = (api:TurnstileApi) => {
      try { api.ready(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(api) } }) } catch { fail() }
    }
    if (window.turnstile) { accept(window.turnstile); return }
    script.src = scriptUrl; script.async = true; script.defer = true
    script.onerror = fail
    script.onload = () => {
      const api = window.turnstile
      if (!api) { fail(); return }
      ownedApi = api
      accept(api)
    }
    document.head.append(script)
  }).catch(error => { pending = null; throw error })
  return pending
}
