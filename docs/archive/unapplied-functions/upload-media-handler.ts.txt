import { matchesMediaHeader, mediaFormats } from '../_shared/media-validation.ts'

interface Reservation { id: string; path: string }
interface Dependencies {
  env: (name: string) => string | undefined
  authenticate: (token: string) => Promise<string | null>
  reserve: (userId: string, size: number, extension: string) => Promise<Reservation | null>
  upload: (path: string, bytes: Uint8Array, type: string) => Promise<void>
  finish: (id: string, succeeded: boolean) => Promise<void>
  readTimeoutMs?: number
}
export function createUploadHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    const allowed = origin !== '' && origin !== 'null' && origin !== '*' && (dependencies.env('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).includes(origin)
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    if (allowed) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers })
    if (origin && !allowed) return reply(403, { error: 'Origin not allowed' })
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
    const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
    const format = Object.hasOwn(mediaFormats, type) ? mediaFormats[type] : undefined
    if (!format) return reply(415, { error: 'Unsupported media type' })
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return reply(401, { error: 'Sign in required' })
    let userId: string | null
    try { userId = await dependencies.authenticate(token) }
    catch { return reply(503, { error: 'Authentication unavailable' }) }
    if (!userId) return reply(401, { error: 'Verified email sign-in required' })
    if (Number(request.headers.get('content-length')) > format.max) return reply(413, { error: 'Media too large' })
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { error: 'Empty media' })
    let expired = false
    const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}) }, dependencies.readTimeoutMs ?? 60000)
    let bytes: Uint8Array
    try {
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > format.max) { await reader.cancel(); return reply(413, { error: 'Media too large' }) }
        chunks.push(value)
      }
      if (expired) return reply(408, { error: 'Upload timed out. Please retry.' })
      if (!size) return reply(400, { error: 'Empty media' })
      bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    } catch { return reply(400, { error: 'Media could not be read' }) }
    finally { clearTimeout(timer) }
    if (!matchesMediaHeader(type, bytes.subarray(0, 16))) return reply(415, { error: 'Media signature does not match its type' })
    let reservation: Reservation | null
    try { reservation = await dependencies.reserve(userId, bytes.byteLength, format.extension) }
    catch { return reply(503, { error: 'Storage usage checks unavailable' }) }
    if (!reservation) return reply(429, { error: 'Daily upload or storage limit reached' })
    // Do not accept paths outside the authenticated owner, even from the usage adapter.
    if (!reservation.path.startsWith(`${userId}/`) || reservation.path.includes('..') || reservation.path.slice(userId.length + 1).includes('/')) return reply(503, { error: 'Invalid storage reservation' })
    try {
      await dependencies.upload(reservation.path, bytes, type)
    } catch {
      try { await dependencies.finish(reservation.id, false) } catch { /* Fail closed: pending bytes remain reserved temporarily. */ }
      return reply(502, { error: 'Media upload failed. Please retry.' })
    }
    try { await dependencies.finish(reservation.id, true) }
    catch { return reply(503, { error: 'Media uploaded, but tracking is delayed. Refresh your library before retrying.' }) }
    return reply(201, { path: reservation.path })
  }
}
