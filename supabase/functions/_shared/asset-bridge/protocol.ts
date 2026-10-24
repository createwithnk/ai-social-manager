// Backend only. Transports must be explicitly injected; importing this file makes no requests.
export const ASSET_PROJECT_URL = 'https://nkfecpdegcmsapvbviky.supabase.co'
export const ASSET_CALLBACK_URL = `${ASSET_PROJECT_URL}/functions/v1/velo-asset-callback`
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export type AssetProvider = 'canva' | 'drive'
export interface AssetClient { clientId: string; clientSecret: string }
export interface AssetGrant { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[]; accountId: string; accountName: string }
export class AssetError extends Error {
  constructor(public code: 'setup_pending' | 'connection_required' | 'provider_unavailable' | 'invalid_asset' | 'request_rejected', public status = code === 'connection_required' ? 409 : code === 'invalid_asset' || code === 'request_rejected' ? 400 : 503) { super(code) }
}
export function assetProvider(value: unknown): AssetProvider {
  if (value !== 'canva' && value !== 'drive') throw new AssetError('request_rejected', 400)
  return value
}
const printable = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= maximum && [...value].every(char => char.charCodeAt(0) >= 33 && char.charCodeAt(0) <= 126)
export function validateClient(provider: AssetProvider, client: AssetClient) {
  if (!/^[A-Za-z0-9._-]{8,256}$/.test(client.clientId) || !printable(client.clientSecret, 2048) || client.clientSecret.length < 12 || (provider === 'drive' && !client.clientId.endsWith('.apps.googleusercontent.com'))) throw new AssetError('setup_pending')
}
export function requiredScopes(provider: AssetProvider): string[] { return provider === 'canva' ? ['design:meta:read'] : [DRIVE_FILE_SCOPE] }
export async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new AssetError('request_rejected', 400)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function assetAuthorizationUrl(provider: AssetProvider, client: AssetClient, state: string, verifier: string): Promise<string> {
  validateClient(provider, client)
  if (!/^[a-f0-9]{64}$/.test(state)) throw new AssetError('request_rejected', 400)
  const url = new URL(provider === 'canva' ? 'https://www.canva.com/api/oauth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: client.clientId, response_type: 'code', redirect_uri: ASSET_CALLBACK_URL, scope: requiredScopes(provider).join(' '), state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256' }).toString()
  if (provider === 'drive') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent select_account') }
  return url.toString()
}
function allowedEndpoint(url: URL, method: string): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
  if (method === 'POST') return !url.search && ((url.hostname === 'api.canva.com' && /^\/rest\/v1\/oauth\/(token|introspect)$/.test(url.pathname)) || (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token'))
  if (method !== 'GET') return false
  if (url.hostname === 'api.canva.com') return !url.search && /^\/rest\/v1\/designs\/[A-Za-z0-9_-]{5,180}$/.test(url.pathname)
  if (url.hostname !== 'www.googleapis.com' || [...url.searchParams.keys()].some(key => key !== 'fields') || url.searchParams.getAll('fields').length !== 1) return false
  return (url.pathname === '/drive/v3/about' && url.searchParams.get('fields') === 'user(permissionId,displayName)') ||
    (/^\/drive\/v3\/files\/[A-Za-z0-9_-]{5,180}$/.test(url.pathname) && url.searchParams.get('fields') === 'id,name,mimeType,size,trashed,capabilities(canDownload)')
}
// The deadline covers headers AND streamed/decompressed body bytes. No redirects or retries.
export async function assetJsonRequest(url: string, init: RequestInit, fetcher: typeof fetch, timeoutMs = 10000): Promise<Record<string, unknown>> {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new AssetError('request_rejected', 400) }
  if (!allowedEndpoint(parsed, init.method ?? 'GET') || timeoutMs < 1 || timeoutMs > 10000) throw new AssetError('request_rejected', 400)
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new AssetError('provider_unavailable')) }, timeoutMs) })
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal })
      if (!response.ok || response.redirected || (response.url && response.url !== parsed.toString()) || !/^application\/(?:json|[a-z0-9.-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length')) > 65536) {
        void response.body?.cancel().catch(() => {})
        throw new AssetError(response.status === 401 || response.status === 403 ? 'connection_required' : 'provider_unavailable')
      }
      reader = response.body?.getReader()
      if (!reader) throw new AssetError('provider_unavailable')
      const chunks: Uint8Array[] = []; let length = 0
      while (true) {
        const result = await reader.read(); if (result.done) break
        length += result.value.byteLength
        if (length > 65536) { void reader.cancel().catch(() => {}); throw new AssetError('provider_unavailable') }
        chunks.push(result.value)
      }
      const bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssetError('provider_unavailable')
      return value as Record<string, unknown>
    })()])
  } catch (error) { if (error instanceof AssetError) throw error; throw new AssetError('provider_unavailable') }
  finally { clearTimeout(timer); controller.abort() }
}
function tokenUrl(provider: AssetProvider) { return provider === 'canva' ? 'https://api.canva.com/rest/v1/oauth/token' : 'https://oauth2.googleapis.com/token' }
function formRequest(provider: AssetProvider, client: AssetClient, body: URLSearchParams): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (provider === 'canva') headers.Authorization = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`
  else { body.set('client_id', client.clientId); body.set('client_secret', client.clientSecret) }
  return { method: 'POST', headers, body }
}
function scopes(value: unknown, provider: AssetProvider): string[] {
  if (typeof value !== 'string' || value.length > 8000 || !requiredScopes(provider).every(scope => value.split(/\s+/).includes(scope))) throw new AssetError('connection_required', 403)
  return requiredScopes(provider)
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(value)) throw new AssetError('provider_unavailable')
  return value
}
async function verifiedGrant(provider: AssetProvider, client: AssetClient, body: Record<string, unknown>, fetcher: typeof fetch, now: number, previous?: AssetGrant): Promise<AssetGrant> {
  if (!printable(body.access_token, 4096) || body.token_type !== 'Bearer' || !Number.isSafeInteger(body.expires_in) || Number(body.expires_in) < 1 || Number(body.expires_in) > 86400) throw new AssetError('provider_unavailable')
  const refreshToken = body.refresh_token ?? (provider === 'drive' ? previous?.refreshToken : undefined)
  if (!printable(refreshToken, 4096)) throw new AssetError('connection_required')
  let granted: string[]; let accountId: string; let accountName: string; let expiresAt = now + Number(body.expires_in) * 1000
  if (provider === 'canva') {
    const info = await assetJsonRequest('https://api.canva.com/rest/v1/oauth/introspect', formRequest(provider, client, new URLSearchParams({ token: body.access_token })), fetcher)
    if (info.active !== true || info.client !== client.clientId || !Number.isSafeInteger(info.exp) || Number(info.exp) * 1000 <= now) throw new AssetError('connection_required')
    granted = scopes(info.scope, provider); accountId = identifier(info.sub); accountName = 'Canva'
    expiresAt = Math.min(expiresAt, Number(info.exp) * 1000)
  } else {
    granted = scopes(body.scope ?? previous?.scopes.join(' '), provider)
    const info = await assetJsonRequest('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName)', { headers: { Authorization: `Bearer ${body.access_token}` } }, fetcher)
    const user = object(info.user); accountId = identifier(user.permissionId)
    accountName = typeof user.displayName === 'string' ? [...user.displayName].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 120) : 'Google Drive'
    if (!accountName) accountName = 'Google Drive'
  }
  if (previous && accountId !== previous.accountId) throw new AssetError('connection_required')
  return { accessToken: body.access_token, refreshToken, expiresAt, scopes: granted, accountId, accountName }
}
export async function exchangeAssetCode(provider: AssetProvider, client: AssetClient, code: string, verifier: string, fetcher: typeof fetch, now = Date.now()): Promise<AssetGrant> {
  validateClient(provider, client); await pkceChallenge(verifier)
  if (!printable(code, 4096)) throw new AssetError('request_rejected', 400)
  const body = await assetJsonRequest(tokenUrl(provider), formRequest(provider, client, new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: ASSET_CALLBACK_URL })), fetcher)
  return verifiedGrant(provider, client, body, fetcher, now)
}
export function validateStoredGrant(value: unknown, provider: AssetProvider): AssetGrant {
  const grant = object(value)
  const scopeList = grant.scopes
  if (!printable(grant.accessToken, 4096) || !printable(grant.refreshToken, 4096) || !Number.isSafeInteger(grant.expiresAt) || Number(grant.expiresAt) <= 0 || !Array.isArray(scopeList) || !scopeList.every(scope => typeof scope === 'string') || !requiredScopes(provider).every(scope => scopeList.includes(scope)) || typeof grant.accountName !== 'string' || !grant.accountName || grant.accountName.length > 200) throw new AssetError('connection_required')
  identifier(grant.accountId)
  return grant as unknown as AssetGrant
}
export async function refreshAssetGrant(provider: AssetProvider, client: AssetClient, previous: AssetGrant, fetcher: typeof fetch, now = Date.now()): Promise<AssetGrant> {
  validateClient(provider, client); validateStoredGrant(previous, provider)
  const body = await assetJsonRequest(tokenUrl(provider), formRequest(provider, client, new URLSearchParams({ grant_type: 'refresh_token', refresh_token: previous.refreshToken })), fetcher)
  return verifiedGrant(provider, client, body, fetcher, now, previous)
}
export interface InspectedAsset { provider: AssetProvider; id: string; title: string; mimeType: string | null; bytes: number | null; canDownload: boolean | null }
export async function inspectProviderAsset(provider: AssetProvider, id: string, grant: AssetGrant, fetcher: typeof fetch): Promise<InspectedAsset> {
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) throw new AssetError('invalid_asset', 400)
  validateStoredGrant(grant, provider)
  const url = provider === 'canva' ? `https://api.canva.com/rest/v1/designs/${id}` : `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size,trashed,capabilities(canDownload)`
  const raw = await assetJsonRequest(url, { headers: { Authorization: `Bearer ${grant.accessToken}` } }, fetcher)
  const item = provider === 'canva' ? object(raw.design) : raw
  if (item.id !== id || (provider === 'drive' && item.trashed !== false)) throw new AssetError('invalid_asset', 400)
  const title = provider === 'canva' ? item.title : item.name
  if (typeof title !== 'string' || !title.trim() || title.length > 512) throw new AssetError('provider_unavailable')
  const bytes = typeof item.size === 'string' && /^\d{1,16}$/.test(item.size) && Number.isSafeInteger(Number(item.size)) ? Number(item.size) : null
  return { provider, id, title, mimeType: typeof item.mimeType === 'string' ? item.mimeType.slice(0, 160) : null, bytes, canDownload: typeof object(item.capabilities).canDownload === 'boolean' ? object(item.capabilities).canDownload as boolean : null }
}
