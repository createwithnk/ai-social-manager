// Server-only, fixed GET metadata reads. No catalog-wide stock search, writes,
// thumbnails, download URLs, export jobs, redirects or automatic retries.
import { CanvaBridgeError, canvaId, canvaKind, pageResult, queryInput, record, reference, type CanvaKind, type CanvaQuery, type CanvaReference } from './contracts.ts'

function resultItem(value: unknown, kind: CanvaKind): CanvaReference {
  const raw = record(value)
  return reference({ kind, id: raw.id, title: raw.title || 'Untitled Canva design', updatedAt: raw.updated_at, origin: 'account' })
}
export async function readCanvaCatalog(
  request: { action: 'list'; input: CanvaQuery } | { action: 'get'; kind: CanvaKind; id: string },
  accessToken: string, scopes: readonly string[], fetcher: typeof fetch, timeoutMs = 10000,
) {
  const kind = canvaKind(request.action === 'list' ? request.input.kind : request.kind)
  if (!scopes.includes(kind === 'design' ? 'design:meta:read' : 'brandtemplate:meta:read')) throw new CanvaBridgeError('scope_required')
  if (!/^[\x21-\x7e]{1,4096}$/.test(accessToken) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new CanvaBridgeError('invalid')
  const url = new URL(`https://api.canva.com/rest/v1/${kind === 'design' ? 'designs' : 'brand-templates'}`)
  if (request.action === 'list') {
    const input = queryInput(request.input)
    if (input.query) url.searchParams.set('query', input.query)
    if (input.continuation) url.searchParams.set('continuation', input.continuation)
    url.searchParams.set('ownership', 'any')
    // List designs has no documented limit parameter; templates supports it.
    if (kind === 'brand-template') url.searchParams.set('limit', '25')
  } else url.pathname += '/' + canvaId(request.id)
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new CanvaBridgeError('unavailable')) }, timeoutMs) })
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal })
      if (!response.ok || response.redirected || (response.url && response.url !== url.toString()) || !/^application\/(?:json|[a-z0-9.-]+\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length')) > 262144) {
        void response.body?.cancel().catch(() => {})
        throw new CanvaBridgeError([401,403].includes(response.status) ? 'connection_required' : 'unavailable')
      }
      reader = response.body?.getReader()
      if (!reader) throw new CanvaBridgeError('unavailable')
      const chunks: Uint8Array[] = []; let length = 0
      while (true) {
        const part = await reader.read(); if (part.done) break
        length += part.value.byteLength
        if (length > 262144) { void reader.cancel().catch(() => {}); throw new CanvaBridgeError('unavailable') }
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(length); let offset = 0
      for (const part of chunks) { bytes.set(part, offset); offset += part.length }
      const body = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
      if (request.action === 'get') {
        const item = resultItem(kind === 'design' ? body.design : body.brand_template, kind)
        if (item.id !== request.id) throw new CanvaBridgeError('unavailable')
        return item
      }
      if (!Array.isArray(body.items) || body.items.length > 100) throw new CanvaBridgeError('unavailable')
      return pageResult({ items: body.items.map(item => resultItem(item, kind)), continuation: body.continuation ?? null }, kind)
    })()])
  } catch (error) { if (error instanceof CanvaBridgeError) throw error; throw new CanvaBridgeError('unavailable') }
  finally { clearTimeout(timer); controller.abort(); try { reader?.releaseLock() } catch { /* Already cancelled. */ } }
}
