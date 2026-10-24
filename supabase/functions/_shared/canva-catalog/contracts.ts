// Pure contracts shared by the optional UI and the server. No secrets or I/O.
export type CanvaKind = 'design' | 'brand-template'
export type CanvaOrigin = 'account' | 'link'
export interface CanvaReference {
  kind: CanvaKind
  id: string
  title: string
  updatedAt: number | null
  origin: CanvaOrigin
}
export interface CanvaPage { items: CanvaReference[]; continuation: string | null }
export interface CanvaQuery { kind: CanvaKind; query: string; continuation?: string }
export type CanvaErrorCode = 'setup_pending' | 'sign_in' | 'connection_required' | 'scope_required' | 'invalid' | 'unavailable' | 'cancelled' | 'storage' | 'conflict' | 'post_changed' | 'asset_changed'
export class CanvaBridgeError extends Error {
  code: CanvaErrorCode
  constructor(code: CanvaErrorCode) { super(code); this.name = 'CanvaBridgeError'; this.code = code }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CanvaBridgeError('invalid')
  return value as Record<string, unknown>
}
export function canvaKind(value: unknown): CanvaKind {
  if (value !== 'design' && value !== 'brand-template') throw new CanvaBridgeError('invalid')
  return value
}
export function canvaId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{5,180}$/.test(value)) throw new CanvaBridgeError('invalid')
  return value
}
export function ownerId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new CanvaBridgeError('sign_in')
  return value
}
export function cleanTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || /[\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new CanvaBridgeError('invalid')
  return value.trim()
}
export function reference(value: unknown): CanvaReference {
  const item = record(value)
  if (item.origin !== 'account' && item.origin !== 'link') throw new CanvaBridgeError('invalid')
  if (item.updatedAt !== null && (!Number.isSafeInteger(item.updatedAt) || Number(item.updatedAt) < 0)) throw new CanvaBridgeError('invalid')
  return { kind: canvaKind(item.kind), id: canvaId(item.id), title: cleanTitle(item.title), updatedAt: item.updatedAt as number | null, origin: item.origin }
}
export function referenceKey(item: Pick<CanvaReference, 'kind' | 'id'>): string { return `${canvaKind(item.kind)}:${canvaId(item.id)}` }
export function referenceUrl(item: Pick<CanvaReference, 'kind' | 'id'>): string {
  const id = canvaId(item.id)
  return canvaKind(item.kind) === 'design' ? `https://www.canva.com/design/${id}/view` : `https://www.canva.com/brand/brand-templates/${id}`
}
export function linkedReference(title: string, raw: string): CanvaReference {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\s\\]/.test(raw)) throw new CanvaBridgeError('invalid')
  let url: URL
  try { url = new URL(raw) } catch { throw new CanvaBridgeError('invalid') }
  if (url.protocol !== 'https:' || !['www.canva.com', 'canva.com'].includes(url.hostname) || url.username || url.password || url.port || url.hash || [...url.searchParams.keys()].some(key => !['utm_content', 'utm_campaign', 'utm_medium', 'utm_source', 'utm_id'].includes(key))) throw new CanvaBridgeError('invalid')
  const design = url.pathname.match(/^\/design\/([A-Za-z0-9_-]+)\/(?:[A-Za-z0-9_-]+\/)?(?:edit|view)\/?$/)
  const template = url.pathname.match(/^\/brand\/brand-templates\/([A-Za-z0-9_-]+)\/?$/)
  if (!design && !template) throw new CanvaBridgeError('invalid')
  return reference({ kind: design ? 'design' : 'brand-template', id: (design ?? template)![1], title, updatedAt: null, origin: 'link' })
}
export function queryInput(value: unknown): CanvaQuery {
  const data = record(value), kind = canvaKind(data.kind)
  if (typeof data.query !== 'string' || data.query.length > 120 || [...data.query].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new CanvaBridgeError('invalid')
  const continuation = data.continuation
  if (continuation !== undefined && (typeof continuation !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(continuation))) throw new CanvaBridgeError('invalid')
  return { kind, query: data.query.trim(), ...(continuation === undefined ? {} : { continuation }) }
}
export function pageResult(value: unknown, kind: CanvaKind): CanvaPage {
  const page = record(value)
  if (!Array.isArray(page.items) || page.items.length > 100 || (page.continuation !== null && (typeof page.continuation !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(page.continuation)))) throw new CanvaBridgeError('invalid')
  const keys = new Set<string>()
  const items = page.items.map(item => {
    const valid = reference(item), key = referenceKey(valid)
    if (valid.kind !== kind || valid.origin !== 'account' || keys.has(key)) throw new CanvaBridgeError('invalid')
    keys.add(key); return valid
  })
  return { items, continuation: page.continuation as string | null }
}
