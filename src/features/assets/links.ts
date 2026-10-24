// Link bookmarks only: no OAuth tokens, file downloads or post mutations.
export class AssetLinkError extends Error {}
export type AssetSource = 'canva' | 'drive'
export interface AssetLink { id: string; source: AssetSource; title: string; url: string }
export interface LinkStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const assetLimit = 100
const safeId = /^[A-Za-z0-9_-]{5,180}$/

export function canonicalAssetLink(raw: string): Pick<AssetLink, 'id' | 'source' | 'url'> {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\s\\]/.test(raw)) throw new AssetLinkError('Use a Canva design or Google Drive file/folder link.')
  let url: URL
  try { url = new URL(raw) } catch { throw new AssetLinkError('Use a Canva design or Google Drive file/folder link.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || [...url.searchParams.keys()].some(key => !['utm_content', 'utm_campaign', 'utm_medium', 'utm_source', 'usp', 'utm_id'].includes(key))) {
    throw new AssetLinkError('Use a clean HTTPS link without access tokens or secret parameters.')
  }
  const canva = ['www.canva.com', 'canva.com'].includes(url.hostname) && url.pathname.match(/^\/design\/([A-Za-z0-9_-]+)\/(?:[A-Za-z0-9_-]+\/)?(?:edit|view)\/?$/)
  if (canva && safeId.test(canva[1])) return { id: `canva:${canva[1]}`, source: 'canva', url: `https://www.canva.com/design/${canva[1]}/view` }
  const drive = url.hostname === 'drive.google.com' && url.pathname.match(/^\/(file\/d|drive\/folders)\/([A-Za-z0-9_-]+)(?:\/view)?\/?$/)
  if (drive && safeId.test(drive[2])) return { id: `drive:${drive[1]}:${drive[2]}`, source: 'drive', url: `https://drive.google.com/${drive[1]}/${drive[2]}${drive[1] === 'file/d' ? '/view' : ''}` }
  throw new AssetLinkError('Use a Canva design or Google Drive file/folder link.')
}

export function createAssetLink(title: string, raw: string): AssetLink {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 || [...title].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new AssetLinkError('Choose an asset name between 1 and 120 characters.')
  return { ...canonicalAssetLink(raw), title: title.trim() }
}

function storageKey(ownerId: string) {
  if (!/^(?:local-preview|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(ownerId)) throw new AssetLinkError('Sign in again before saving asset links.')
  return `velo:asset-links:v1:${ownerId}`
}
function validatedItems(value: unknown): AssetLink[] {
  if (!Array.isArray(value) || value.length > assetLimit) throw new AssetLinkError('Saved asset links need review. No links were overwritten.')
  const ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new AssetLinkError('Saved asset links need review. No links were overwritten.')
    const asset = createAssetLink(item.title, item.url)
    if (asset.id !== item.id || asset.source !== item.source || ids.has(asset.id)) throw new AssetLinkError('Saved asset links need review. No links were overwritten.')
    ids.add(asset.id)
    return asset
  })
}
export function readAssetLinks(storage: LinkStorage, ownerId: string): AssetLink[] {
  const raw = storage.getItem(storageKey(ownerId))
  if (raw === null) return []
  if (raw.length > 200_000) throw new AssetLinkError('Saved asset links need review. No links were overwritten.')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new AssetLinkError('Saved asset links need review. No links were overwritten.') }
  const record = value as { version?: unknown; ownerId?: unknown; items?: unknown } | null
  if (!record || record.version !== 1 || record.ownerId !== ownerId) throw new AssetLinkError('Saved asset links need review. No links were overwritten.')
  return validatedItems(record.items)
}
export function addAssetLink(storage: LinkStorage, ownerId: string, asset: AssetLink): AssetLink[] {
  const current = readAssetLinks(storage, ownerId)
  const valid = validatedItems([asset])[0]
  if (current.some(item => item.id === valid.id)) throw new AssetLinkError('This link is already in your library.')
  if (current.length >= assetLimit) throw new AssetLinkError('The link library is full. Remove a bookmark before adding another.')
  const next = [valid, ...current]
  storage.setItem(storageKey(ownerId), JSON.stringify({ version: 1, ownerId, items: next }))
  return next
}
export function removeAssetLink(storage: LinkStorage, ownerId: string, id: string): AssetLink[] {
  const next = readAssetLinks(storage, ownerId).filter(item => item.id !== id)
  storage.setItem(storageKey(ownerId), JSON.stringify({ version: 1, ownerId, items: next }))
  return next
}
