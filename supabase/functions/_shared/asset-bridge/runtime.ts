import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { readBody, sessionId, uuid } from '../security.ts'
import { ASSET_PROJECT_URL, AssetError, validateClient, type AssetProvider } from './protocol.ts'
import type { AssetConfig, AssetRuntime } from './service.ts'

export function loadAssetConfig(read: (name: string) => string): AssetConfig {
  // Scope check BEFORE reading any runtime service or provider credential.
  if (read('SUPABASE_URL').replace(/\/$/, '') !== ASSET_PROJECT_URL) throw new AssetError('setup_pending')
  let app: URL
  try { app = new URL(read('AASIFLOW_ASSET_APP_URL')) } catch { throw new AssetError('setup_pending') }
  if (app.protocol !== 'https:' || app.username || app.password || app.port || app.pathname !== '/' || app.search || app.hash || ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)) throw new AssetError('setup_pending')
  const tokenKey = read('AASIFLOW_ASSET_TOKEN_KEY')
  try { if (atob(tokenKey).length !== 32) throw new Error() } catch { throw new AssetError('setup_pending') }
  const clients: AssetConfig['clients'] = {}
  for (const provider of ['canva', 'drive'] as AssetProvider[]) {
    const prefix = provider === 'canva' ? 'AASIFLOW_CANVA' : 'AASIFLOW_DRIVE'
    const client = { clientId: read(`${prefix}_CLIENT_ID`), clientSecret: read(`${prefix}_CLIENT_SECRET`) }
    if (client.clientId || client.clientSecret) { validateClient(provider, client); clients[provider] = client }
  }
  return { appUrl: app.toString(), tokenKey, clients, enabled: read('AASIFLOW_ASSET_CONNECTIONS_ENABLED') === 'true' }
}

// This transport is only for the fixed AasiFlowAI Auth/RPC paths. No generic
// management credentials, project enumeration, SQL, uploads or redirects.
export async function assetProjectFetch(input: RequestInfo | URL, init: RequestInit | undefined, fetcher: typeof fetch): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  if (url.origin !== ASSET_PROJECT_URL || url.username || url.password || url.hash || url.search || !['/auth/v1/user', '/rest/v1/rpc/has_active_session', '/rest/v1/rpc/velo_asset_command'].includes(url.pathname) || method !== (url.pathname === '/auth/v1/user' ? 'GET' : 'POST')) throw new AssetError('request_rejected', 400)
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AssetError('provider_unavailable')) }, 8000) })
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(input, { ...init, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' })
      if (response.redirected || (response.url && response.url !== url.toString())) throw new AssetError('provider_unavailable')
      return new Response(new Uint8Array(await readBody(response, 65536)), { status: response.status, statusText: response.statusText, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    })()])
  } catch { throw new AssetError('provider_unavailable') } finally { clearTimeout(timer); controller.abort() }
}

export function createAssetRuntime(read: (name: string) => string, fetcher: typeof fetch = fetch): AssetRuntime {
  const config = () => loadAssetConfig(read)
  const configuredKey = (dictionary: string, fallback: string): string => {
    let value: unknown
    try { value = JSON.parse(read(dictionary) || '{}').default } catch { /* Reserved runtime dictionary may be absent. */ }
    const key = typeof value === 'string' && value ? value : read(fallback)
    if (!key) throw new AssetError('setup_pending')
    return key
  }
  const client = (service: boolean, authorization?: string) => {
    config()
    const key = service ? configuredKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') : configuredKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    return createClient(ASSET_PROJECT_URL, key, { db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => assetProjectFetch(input, init, fetcher), ...(authorization ? { headers: { Authorization: authorization } } : {}) } })
  }
  return {
    config, fetcher,
    async identify(req) {
      const auth = req.headers.get('authorization') ?? ''
      if (!/^Bearer \S{1,8192}$/.test(auth)) throw new AssetError('request_rejected', 401)
      const userClient = client(false, auth)
      const { data, error } = await userClient.auth.getUser(auth.slice(7))
      if (error || !data.user || !uuid(data.user.id)) throw new AssetError('request_rejected', 401)
      const active = await userClient.rpc('has_active_session')
      if (active.error || active.data !== true) throw new AssetError('request_rejected', 401)
      let sid: string
      try { sid = sessionId(auth.slice(7)) } catch { throw new AssetError('request_rejected', 401) }
      return { userId: data.user.id, sessionId: sid }
    },
    async command(op, owner, p) {
      const result = await client(true).rpc('velo_asset_command', { op, uid: owner?.userId ?? null, sid: owner?.sessionId ?? null, p })
      if (result.error) throw new AssetError('provider_unavailable')
      return result.data
    },
  }
}
