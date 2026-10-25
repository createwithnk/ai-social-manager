import { canonicalAssetLink } from './links.ts'

export type ConnectedProvider = 'canva' | 'drive'
export type ConnectionState = 'pending' | 'connected' | 'reconnect' | 'disconnected'
export interface ConnectionSummary { provider: ConnectedProvider; status: ConnectionState; accountName: string | null }
export interface ConnectionStatus { enabled: boolean; configured: Record<ConnectedProvider, boolean>; connections: ConnectionSummary[] }
export interface AssetMetadata { provider: ConnectedProvider; id: string; title: string; mimeType: string | null; bytes: number | null; canDownload: boolean | null }
export interface AssetConnectionApi {
  status(): Promise<ConnectionStatus>
  start(provider: ConnectedProvider): Promise<string>
  inspect(link: string): Promise<AssetMetadata>
  disconnect(provider: ConnectedProvider): Promise<void>
}
const callback = 'https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/velo-asset-callback'
export class AssetConnectionError extends Error {}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssetConnectionError('The asset server returned an invalid result.'); return value as Record<string, unknown> }
export function connectedProvider(value: unknown): ConnectedProvider { if (value !== 'canva' && value !== 'drive') throw new AssetConnectionError('The asset server returned an invalid result.'); return value }
export function connectionStatus(value: unknown): ConnectionStatus {
  const body = object(value), configured = object(body.configured)
  if (typeof body.enabled !== 'boolean' || typeof configured.canva !== 'boolean' || typeof configured.drive !== 'boolean' || !Array.isArray(body.connections) || body.connections.length > 2) throw new AssetConnectionError('The asset server returned an invalid result.')
  const seen = new Set<string>()
  const connections = body.connections.map(item => {
    const record = object(item), provider = connectedProvider(record.provider)
    if (seen.has(provider) || !['pending', 'connected', 'reconnect', 'disconnected'].includes(String(record.status)) || (record.accountName !== null && (typeof record.accountName !== 'string' || record.accountName.length > 200))) throw new AssetConnectionError('The asset server returned an invalid result.')
    seen.add(provider)
    return { provider, status: record.status as ConnectionState, accountName: record.accountName as string | null }
  })
  return { enabled: body.enabled, configured: { canva: configured.canva, drive: configured.drive }, connections }
}
export function authorizationLink(value: unknown, provider: ConnectedProvider): string {
  if (typeof value !== 'string' || value.length > 8000) throw new AssetConnectionError('The asset server returned an invalid result.')
  let url: URL
  try { url = new URL(value) } catch { throw new AssetConnectionError('The asset server returned an invalid result.') }
  const keys = ['client_id', 'response_type', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', ...(provider === 'drive' ? ['access_type', 'prompt'] : [])]
  const expected = provider === 'canva' ? 'https://www.canva.com/api/oauth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth'
  if (url.origin + url.pathname !== expected || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => !keys.includes(key)) || keys.some(key => url.searchParams.getAll(key).length !== 1) || url.searchParams.get('redirect_uri') !== callback || url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('state') ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge') ?? '') || !/^[A-Za-z0-9._-]{8,256}$/.test(url.searchParams.get('client_id') ?? '') || url.searchParams.get('scope') !== (provider === 'canva' ? 'design:meta:read' : 'https://www.googleapis.com/auth/drive.file') || (provider === 'drive' && (url.searchParams.get('access_type') !== 'offline' || url.searchParams.get('prompt') !== 'consent select_account'))) throw new AssetConnectionError('The asset server returned an invalid result.')
  return url.toString()
}
export function inspectReference(link: string): { provider: ConnectedProvider; assetId: string } {
  let asset: ReturnType<typeof canonicalAssetLink>
  try { asset = canonicalAssetLink(link) } catch { throw new AssetConnectionError('Choose a Canva design or a Google Drive file link.') }
  if (asset.id.startsWith('drive:drive/folders:')) throw new AssetConnectionError('Choose a Canva design or a Google Drive file link.')
  return { provider: asset.source, assetId: asset.id.split(':').at(-1)! }
}
export function assetMetadata(value: unknown, expected: { provider: ConnectedProvider; assetId: string }): AssetMetadata {
  const body = object(value), item = object(body.asset)
  if (item.provider !== expected.provider || item.id !== expected.assetId || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 512 || (item.mimeType !== null && (typeof item.mimeType !== 'string' || item.mimeType.length > 160)) || (item.bytes !== null && (!Number.isSafeInteger(item.bytes) || Number(item.bytes) < 0)) || (item.canDownload !== null && typeof item.canDownload !== 'boolean')) throw new AssetConnectionError('The asset server returned an invalid result.')
  return { provider: expected.provider, id: expected.assetId, title: item.title, mimeType: item.mimeType as string | null, bytes: item.bytes as number | null, canDownload: item.canDownload as boolean | null }
}
export function createAssetConnectionApi(invoke: (body: Record<string, unknown>) => Promise<unknown>): AssetConnectionApi {
  return {
    status: async () => connectionStatus(await invoke({ action: 'status' })),
    start: async provider => authorizationLink(object(await invoke({ action: 'start', provider: connectedProvider(provider) })).authorizationUrl, provider),
    inspect: async link => { const reference = inspectReference(link); return assetMetadata(await invoke({ action: 'inspect', ...reference }), reference) },
    disconnect: async provider => { const result = object(await invoke({ action: 'disconnect', provider: connectedProvider(provider) })); if (result.disconnected !== true || result.provider !== provider) throw new AssetConnectionError('The asset server returned an invalid result.') },
  }
}
