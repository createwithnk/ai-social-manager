import { createGeminiProvider } from './gemini.ts'
import { readBody } from '../_shared/security.ts'
import { readUsage, validReservation, type AiReservation, type AiUsage, type AiOutcome } from './monitoring.ts'

interface Dependencies {
  env: (name: string) => string | undefined
  authenticate: (url: string, key: string, token: string) => Promise<string | null>
  consumeCredit: (userId: string, token: string) => Promise<boolean>
  fetch: typeof fetch
  timeoutMs?: number
  readTimeoutMs?: number
  readMedia?: (path: string, type: string, token: string) => Promise<{ mimeType: string; data: string }>
  reserveAi?: (model: string, token: string) => Promise<AiReservation | null>
  finishAi?: (id: string, outcome: AiOutcome, usage: AiUsage | null, latencyMs: number) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    const origins = (dependencies.env('ALLOWED_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter((item) => item && item !== 'null' && item !== '*')
    const allowed = origins.includes(origin)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
    if (allowed) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers })
    if (origin && !allowed) return reply(403, { error: 'Origin not allowed' })
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'Expected JSON' })
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return reply(401, { error: 'Sign in required' })
    const url = dependencies.env('SUPABASE_URL')
    let publicKey: string | undefined
    try { publicKey = JSON.parse(dependencies.env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default } catch { /* Fall back to the configured public key. */ }
    const key = publicKey ?? dependencies.env('SUPABASE_ANON_KEY') ?? dependencies.env('SUPABASE_PUBLISHABLE_KEY')
    if (!url || !key) return reply(503, { error: 'Authentication service is not configured' })
    let userId: string | null
    try {
      userId = await dependencies.authenticate(url, key, token)
      if (!userId) return reply(401, { error: 'Invalid session' })
    } catch {
      return reply(503, { error: 'Authentication service unavailable. Please retry.' })
    }
    if (Number(request.headers.get('content-length')) > 8192) return reply(413, { error: 'Request too large' })
    let input: unknown
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { error: 'Invalid JSON' })
    let expired = false
    const readTimer = setTimeout(() => {
      expired = true
      void reader.cancel().catch(() => {})
    }, dependencies.readTimeoutMs ?? 10000)
    try {
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 8192) {
          await reader.cancel()
          return reply(413, { error: 'Request too large' })
        }
        chunks.push(value)
      }
      if (expired) return reply(408, { error: 'Request timed out. Please retry.' })
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      input = JSON.parse(new TextDecoder().decode(bytes))
    } catch { return reply(expired ? 408 : 400, { error: expired ? 'Request timed out. Please retry.' : 'Invalid JSON' }) }
    finally { clearTimeout(readTimer) }
    if (!isRecord(input)) return reply(400, { error: 'Invalid request' })
    const { idea, platform, tone } = input
    const languageAliases: Record<string, string> = { English: 'en', Arabic: 'ar', Hindi: 'hi', Urdu: 'ur' }
    const language = typeof input.language === 'string' ? languageAliases[input.language] ?? input.language : input.language ?? 'en'
    const market = input.market ?? 'General'
    if (typeof idea !== 'string' || idea.trim().length < 10 || idea.length > 500 ||
        typeof platform !== 'string' || !['Instagram', 'LinkedIn', 'Facebook', 'X'].includes(platform) ||
        typeof tone !== 'string' || !['Friendly', 'Professional', 'Bold', 'Educational'].includes(tone) ||
        typeof language !== 'string' || !['en', 'ar', 'hi', 'ur'].includes(language) ||
        typeof market !== 'string' || !['General', 'UAE', 'Saudi Arabia', 'Kuwait', 'Gulf'].includes(market)) return reply(400, { error: 'Invalid content brief' })
    const geminiKey = dependencies.env('GEMINI_API_KEY')
    if (!geminiKey) return reply(503, { error: 'AI service is not configured' })
    const model = dependencies.env('GEMINI_MODEL') ?? 'gemini-2.5-flash'
    if (!/^gemini-[a-z0-9.-]+$/.test(model)) return reply(503, { error: 'Invalid model configuration' })
    const media = input.media
    if (media != null && (!isRecord(media) || typeof media.path !== 'string' || !media.path.startsWith(`${userId}/`) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(media.path.slice(userId.length + 1)) ||
      typeof media.type !== 'string' || !['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg'].includes(media.type))) return reply(400, { error: 'Invalid attachment' })
    // The runtime adapter always supplies the reservation path. Legacy dependency
    // fixtures may still use consumeCredit; it is never an automatic RPC fallback.
    let reservation: AiReservation | null = null
    if (dependencies.reserveAi && (!dependencies.finishAi || model !== 'gemini-2.5-flash')) return reply(503, { error: 'AI monitoring is not configured' })
    if (dependencies.reserveAi && media != null) return reply(400, { error: 'AI attachments are disabled for this Beta.' })
    try {
      if (dependencies.reserveAi) {
        const result = await dependencies.reserveAi(model, token)
        if (!result) return reply(429, { error: 'AI is paused or the Beta usage limit was reached.' })
        if (!validReservation(result)) return reply(503, { error: 'AI usage checks unavailable. Please retry later.' })
        reservation = result
      } else if (!await dependencies.consumeCredit(userId, token)) return reply(429, { error: 'Daily AI limit reached. Try again after midnight UTC.' })
    } catch {
      return reply(503, { error: 'AI usage checks unavailable. Please retry later.' })
    }
    let attachment: { mimeType: string; data: string } | undefined
    if (isRecord(media)) {
      try {
        if (!dependencies.readMedia) throw new Error('Attachment service unavailable')
        attachment = await dependencies.readMedia(media.path as string, media.type as string, token)
      } catch { return reply(400, { error: 'Attachment could not be read' }) }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 25000)
    const started = Date.now()
    let outcome: AiOutcome = 'provider_error'
    let usage: AiUsage | null = null
    try {
      const response = await createGeminiProvider(dependencies.fetch, geminiKey, model, reservation?.maxOutputTokens).generate({ idea: idea.trim(), platform, tone, language, market, attachment }, controller.signal)
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return reply(502, { error: 'AI provider unavailable. Try again later.' })
      }
      outcome = 'invalid_response'
      const result: unknown = JSON.parse(new TextDecoder().decode(await readBody(response, 128 * 1024)))
      usage = readUsage(result)
      if (!isRecord(result) || !Array.isArray(result.candidates)) return reply(502, { error: 'AI returned no content' })
      const candidate: unknown = result.candidates[0]
      if (!isRecord(candidate) || candidate.finishReason !== 'STOP' || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return reply(502, { error: 'AI returned incomplete content' })
      const raw = candidate.content.parts.filter((part: unknown) => isRecord(part) && part.thought !== true && typeof part.text === 'string').map((part: Record<string, unknown>) => part.text).join('')
      const draft: unknown = JSON.parse(raw)
      if (!isRecord(draft) || typeof draft.caption !== 'string' || !draft.caption.trim() || draft.caption.length > 10000 ||
          !Array.isArray(draft.hashtags) || draft.hashtags.length > 8 ||
          !draft.hashtags.every((tag: unknown) => typeof tag === 'string' && /^[\p{L}\p{M}\p{N}_]{1,80}$/u.test(tag)) ||
          new Set(draft.hashtags).size !== draft.hashtags.length) return reply(502, { error: 'AI response format was invalid' })
      const limits: Record<string, number> = { Instagram: 2200, LinkedIn: 3000, Facebook: 63206, X: 280 }
      const fullText = `${draft.caption.trim()}\n\n${draft.hashtags.map((tag) => `#${tag}`).join(' ')}`.trim()
      if ([...fullText].length > limits[platform]) return reply(502, { error: 'AI response exceeds the platform limit' })
      outcome = 'success'
      return reply(200, { caption: draft.caption.trim(), hashtags: draft.hashtags })
    } catch {
      if (controller.signal.aborted) outcome = 'timeout'
      return reply(502, { error: 'AI generation failed. Please retry.' })
    } finally {
      // Keep the timeout active through response-body reading, not just response headers.
      clearTimeout(timeout)
      if (reservation && dependencies.finishAi) {
        try { await dependencies.finishAi(reservation.id, outcome, usage, Math.min(120000,Math.max(0,Date.now()-started))) }
        catch { /* Leave the durable reservation pending; never release unknown spend or log payloads. */ }
      }
    }
  }
}
