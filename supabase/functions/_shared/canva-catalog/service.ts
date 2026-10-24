// New read-only catalog endpoint. Reuses existing project/Auth/grant contracts;
// never widens OAuth scopes or adds a database command/table.
import { decryptToken, encryptToken, uuid } from '../security.ts'
import { AssetError, refreshAssetGrant, validateStoredGrant } from '../asset-bridge/protocol.ts'
import { assetRequestJSON, type AssetRuntime } from '../asset-bridge/service.ts'
import { CanvaBridgeError, canvaId, canvaKind, queryInput, record } from './contracts.ts'
import { readCanvaCatalog } from './transport.ts'

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } }) }
function failure(error: unknown) {
  const code = error instanceof CanvaBridgeError ? error.code : error instanceof AssetError ? ({ setup_pending: 'setup_pending', connection_required: 'connection_required', request_rejected: error.status === 401 ? 'sign_in' : 'invalid' } as Record<string,string>)[error.code] ?? 'unavailable' : 'unavailable'
  return json(code === 'sign_in' ? 401 : ['connection_required','scope_required'].includes(code) ? 409 : code === 'invalid' ? 400 : code === 'setup_pending' ? 423 : 503, { error: code })
}
export function createCanvaCatalogHandler(runtime: AssetRuntime, enabled: () => boolean = () => false) {
  return async (req: Request): Promise<Response> => {
    let cors: Record<string,string> = {}
    try {
      const config = runtime.config(), origin = req.headers.get('origin'), allowed = new URL(config.appUrl).origin
      if (origin && origin !== allowed) return json(403, { error: 'invalid' })
      cors = { 'Access-Control-Allow-Origin': origin ?? allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', Vary: 'Origin' }
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'invalid' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
      if (!enabled() || !config.enabled || !config.clients.canva) throw new CanvaBridgeError('setup_pending')
      const body = await assetRequestJSON(req)
      if (Object.keys(body).some(key => !['action','kind','query','continuation','id'].includes(key)) || !['list','get'].includes(String(body.action))) throw new CanvaBridgeError('invalid')
      const input = body.action === 'list'
        ? { action: 'list' as const, input: queryInput(body) }
        : { action: 'get' as const, kind: canvaKind(body.kind), id: canvaId(body.id) }
      if ((body.action === 'list' && body.id !== undefined) || (body.action === 'get' && (body.query !== undefined || body.continuation !== undefined))) throw new CanvaBridgeError('invalid')
      const owner = await runtime.identify(req)
      if (!uuid(owner.userId) || !uuid(owner.sessionId)) throw new CanvaBridgeError('sign_in')
      const claimed = await runtime.command('claim', owner, { provider: 'canva' })
      if (!claimed) throw new CanvaBridgeError('connection_required')
      const claim = record(claimed)
      if (!uuid(claim.id) || !uuid(claim.generation) || !uuid(claim.lease) || typeof claim.encryptedGrant !== 'string') throw new CanvaBridgeError('connection_required')
      const context = `velo-asset-grant:${claim.id}:${owner.userId}:canva`
      const finish = (payload: Record<string,unknown>) => runtime.command('finish', owner, { id: claim.id, generation: claim.generation, lease: claim.lease, provider: 'canva', ...payload })
      let grant
      try { grant = validateStoredGrant(JSON.parse(await decryptToken(claim.encryptedGrant, config.tokenKey, context)), 'canva') }
      catch { await finish({ failed: true }); throw new CanvaBridgeError('connection_required') }
      if (grant.expiresAt <= (runtime.now?.() ?? Date.now()) + 60000) {
        try { grant = await refreshAssetGrant('canva', config.clients.canva, grant, runtime.fetcher, runtime.now?.() ?? Date.now()) }
        catch { await finish({ failed: true }); throw new CanvaBridgeError('connection_required') }
      }
      let result: unknown, error: unknown
      try { result = await readCanvaCatalog(input, grant.accessToken, grant.scopes, runtime.fetcher) } catch (cause) { error = cause }
      // Persist rotated refresh tokens even after a GET failure. If finishing is
      // uncertain, return no catalog and leave the durable lease locked.
      const encryptedGrant = await encryptToken(JSON.stringify(grant), config.tokenKey, context)
      if (await finish({ encryptedGrant, accountId: grant.accountId, accountName: grant.accountName, expiresAt: grant.expiresAt }) !== true) throw new CanvaBridgeError('connection_required')
      if (error) throw error
      const response = json(200, { ...(input.action === 'list' ? { page: result } : { item: result }) })
      for (const [key,value] of Object.entries(cors)) response.headers.set(key,value)
      return response
    } catch (error) {
      const response = failure(error)
      for (const [key,value] of Object.entries(cors)) response.headers.set(key,value)
      return response
    }
  }
}
