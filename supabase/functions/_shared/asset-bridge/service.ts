import { decryptToken, encryptToken, randomState, sha256, uuid } from '../security.ts'
import { AssetError, assetAuthorizationUrl, assetProvider, exchangeAssetCode, inspectProviderAsset, refreshAssetGrant, validateClient, validateStoredGrant, type AssetClient, type AssetGrant, type AssetProvider } from './protocol.ts'

export interface AssetConfig { enabled: boolean; appUrl: string; tokenKey: string; clients: Partial<Record<AssetProvider, AssetClient>> }
export interface AssetIdentity { userId: string; sessionId: string }
export interface AssetRuntime {
  config(): AssetConfig
  identify(req: Request): Promise<AssetIdentity>
  command(operation: string, identity: AssetIdentity | null, payload: Record<string, unknown>): Promise<unknown>
  fetcher: typeof fetch
  now?: () => number
}
type Row = Record<string, unknown>
function row(value: unknown): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssetError('connection_required', 409); return value as Row }
function identity(value: AssetIdentity): AssetIdentity { if (!uuid(value.userId) || !uuid(value.sessionId)) throw new AssetError('request_rejected', 401); return value }
function field(value: Row, key: string): string { if (typeof value[key] !== 'string') throw new AssetError('connection_required', 409); return value[key] as string }
function connection(value: Row) { if (!uuid(value.id) || !uuid(value.generation)) throw new AssetError('connection_required', 409); return { id: value.id, generation: value.generation } }
function client(config: AssetConfig, provider: AssetProvider): AssetClient { const value = config.clients[provider]; if (!value) throw new AssetError('setup_pending'); validateClient(provider, value); return value }
function stateContext(hash: string, owner: AssetIdentity, provider: AssetProvider) { return `velo-asset-state:${hash}:${owner.userId}:${owner.sessionId}:${provider}` }
function grantContext(id: string, userId: string, provider: AssetProvider) { return `velo-asset-grant:${id}:${userId}:${provider}` }
function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } }) }
function errorResponse(error: unknown): Response { return error instanceof AssetError ? json(error.status, { error: error.code }) : json(503, { error: 'provider_unavailable' }) }

// A body deadline prevents a signed-in caller from holding an Edge worker open.
export async function assetRequestJSON(req: Request, timeoutMs = 3000): Promise<Row> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AssetError('request_rejected', 415)
  if (Number(req.headers.get('content-length')) > 4096) throw new AssetError('request_rejected', 413)
  const reader = req.body?.getReader(); if (!reader) throw new AssetError('request_rejected', 400)
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new AssetError('request_rejected', 408)) }, timeoutMs) })
  try {
    return await Promise.race([deadline, (async () => {
      const chunks: Uint8Array[] = []; let length = 0
      while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 4096) { void reader.cancel().catch(() => {}); throw new AssetError('request_rejected', 413) } chunks.push(part.value) }
      const bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      return row(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    })()])
  } catch (error) { if (error instanceof AssetError) throw error; throw new AssetError('request_rejected', 400) }
  finally { clearTimeout(timer); reader.releaseLock() }
}

export async function startAssetConnection(runtime: AssetRuntime, config: AssetConfig, owner: AssetIdentity, provider: AssetProvider) {
  const credentials = client(config, provider)
  const state = randomState(), verifier = randomState(), hash = await sha256(state)
  const encryptedVerifier = await encryptToken(verifier, config.tokenKey, stateContext(hash, owner, provider))
  connection(row(await runtime.command('begin', owner, { provider, stateHash: hash, encryptedVerifier })))
  return { authorizationUrl: await assetAuthorizationUrl(provider, credentials, state, verifier) }
}

async function storeGrant(runtime: AssetRuntime, config: AssetConfig, operation: 'save' | 'finish', owner: AssetIdentity, provider: AssetProvider, claim: Row, grant: AssetGrant) {
  const meta = connection(claim)
  const encryptedGrant = await encryptToken(JSON.stringify(grant), config.tokenKey, grantContext(meta.id, owner.userId, provider))
  const ok = await runtime.command(operation, owner, { ...meta, provider, lease: claim.lease, encryptedGrant, accountId: grant.accountId, accountName: grant.accountName, expiresAt: grant.expiresAt })
  if (ok !== true) throw new AssetError('connection_required', 409)
}

export async function inspectConnectedAsset(runtime: AssetRuntime, config: AssetConfig, owner: AssetIdentity, provider: AssetProvider, id: unknown) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{5,180}$/.test(id)) throw new AssetError('invalid_asset', 400)
  const credentials = client(config, provider)
  const claim = row(await runtime.command('claim', owner, { provider })); const meta = connection(claim)
  if (!uuid(claim.lease)) throw new AssetError('connection_required', 409)
  let grant: AssetGrant
  try { grant = validateStoredGrant(JSON.parse(await decryptToken(field(claim, 'encryptedGrant'), config.tokenKey, grantContext(meta.id, owner.userId, provider))), provider) }
  catch { await runtime.command('finish', owner, { ...meta, provider, lease: claim.lease, failed: true }); throw new AssetError('connection_required', 409) }
  if (grant.expiresAt <= (runtime.now?.() ?? Date.now()) + 60000) {
    // Refresh is single-attempt. If its outcome is ambiguous, never reuse the old token.
    try { grant = await refreshAssetGrant(provider, credentials, grant, runtime.fetcher, runtime.now?.() ?? Date.now()) }
    catch { await runtime.command('finish', owner, { ...meta, provider, lease: claim.lease, failed: true }); throw new AssetError('connection_required', 409) }
  }
  let result: Awaited<ReturnType<typeof inspectProviderAsset>> | undefined; let failure: unknown
  try { result = await inspectProviderAsset(provider, id, grant, runtime.fetcher) } catch (error) { failure = error }
  // Persist a rotated token even when the subsequent metadata GET failed.
  // If this write fails, the durable lease stays blocked until a fresh OAuth flow.
  await storeGrant(runtime, config, 'finish', owner, provider, claim, grant)
  if (failure) throw failure
  return result
}

export function createAssetAccountHandler(runtime: AssetRuntime) {
  return async (req: Request): Promise<Response> => {
    let config: AssetConfig
    try { config = runtime.config() } catch (error) { return errorResponse(error) }
    const origin = req.headers.get('origin')
    if (origin && origin !== new URL(config.appUrl).origin) return json(403, { error: 'request_rejected' })
    const headers = { 'Access-Control-Allow-Origin': origin ?? new URL(config.appUrl).origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Vary': 'Origin' }
    let response: Response
    try {
      if (req.method === 'OPTIONS') response = new Response(null, { status: 204 })
      else if (req.method !== 'POST') response = json(405, { error: 'request_rejected' })
      else {
        const body = await assetRequestJSON(req)
        if (!['status', 'start', 'inspect', 'disconnect'].includes(String(body.action))) throw new AssetError('request_rejected', 400)
        if (Object.keys(body).some(key => !['action', 'provider', 'assetId'].includes(key))) throw new AssetError('request_rejected', 400)
        // Disconnection/status remain possible after disabling new connections/reads.
        if (!config.enabled && body.action !== 'disconnect' && body.action !== 'status') throw new AssetError('setup_pending', 423)
        const owner = identity(await runtime.identify(req))
        if (body.action === 'status') {
          const result = row(await runtime.command('list', owner, {}))
          // Do not serialize arbitrary database fields or encrypted columns.
          const list = Array.isArray(result.connections) ? result.connections.slice(0, 2).map(item => {
            const value = row(item); const provider = assetProvider(value.provider)
            const state = ['pending', 'connected', 'reconnect', 'disconnected'].includes(String(value.status)) ? value.status : 'reconnect'
            const date = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null
            return { provider, status: state, accountName: typeof value.accountName === 'string' ? value.accountName.slice(0, 200) : null, expiresAt: date(value.expiresAt), updatedAt: date(value.updatedAt) }
          }) : []
          response = json(200, { enabled: config.enabled && result.enabled === true, configured: { canva: !!config.clients.canva, drive: !!config.clients.drive }, connections: list })
        } else {
          const provider = assetProvider(body.provider)
          if (body.action === 'disconnect') {
            if (await runtime.command('disconnect', owner, { provider }) !== true) throw new AssetError('connection_required', 409)
            response = json(200, { disconnected: true, provider })
          } else if (body.action === 'start') response = json(200, await startAssetConnection(runtime, config, owner, provider))
          else response = json(200, { asset: await inspectConnectedAsset(runtime, config, owner, provider, body.assetId) })
        }
      }
    } catch (error) { response = errorResponse(error) }
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  }
}

export function createAssetCallbackHandler(runtime: AssetRuntime) {
  return async (req: Request): Promise<Response> => {
    let config: AssetConfig
    try { config = runtime.config(); if (!config.enabled) throw new AssetError('setup_pending', 423) } catch (error) { return errorResponse(error) }
    let success = false
    try {
      const url = new URL(req.url)
      // A gateway can present an internal URL. Never derive the provider callback
      // or return destination from Host/Forwarded; both outbound URLs stay pinned.
      if (req.method !== 'GET' || !['/functions/v1/velo-asset-callback', '/velo-asset-callback'].includes(url.pathname) || req.url.length > 12000 || url.hash || [...url.searchParams.keys()].some(key => !['state', 'code', 'error', 'error_description', 'scope', 'authuser', 'prompt'].includes(key)) || [...new Set(url.searchParams.keys())].some(key => url.searchParams.getAll(key).length !== 1)) throw new AssetError('request_rejected', 400)
      const state = url.searchParams.get('state') ?? ''
      if (!/^[a-f0-9]{64}$/.test(state)) throw new AssetError('request_rejected', 400)
      const hash = await sha256(state)
      const pending = row(await runtime.command('take', null, { stateHash: hash })); connection(pending)
      const owner = identity({ userId: field(pending, 'userId'), sessionId: field(pending, 'sessionId') }), provider = assetProvider(pending.provider)
      if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new AssetError('connection_required', 409)
      const verifier = await decryptToken(field(pending, 'encryptedVerifier'), config.tokenKey, stateContext(hash, owner, provider))
      const grant = await exchangeAssetCode(provider, client(config, provider), url.searchParams.get('code')!, verifier, runtime.fetcher, runtime.now?.() ?? Date.now())
      await storeGrant(runtime, config, 'save', owner, provider, pending, grant)
      success = true
    } catch { /* Return only a fixed result; OAuth codes, state and provider errors are never reflected. */ }
    const destination = new URL(config.appUrl); destination.searchParams.set('velo_asset', success ? 'connected' : 'retry')
    return new Response(null, { status: 303, headers: { Location: destination.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } })
  }
}
