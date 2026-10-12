import { createGeminiProvider } from './gemini.ts'

interface Dependencies {
  env: (name: string) => string | undefined
  authenticate: (url: string, key: string, token: string) => Promise<string | null>
  consumeCredit: (userId: string) => Promise<boolean>
  fetch: typeof fetch
  timeoutMs?: number
  readTimeoutMs?: number
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
    const key = dependencies.env('SUPABASE_ANON_KEY') ?? dependencies.env('SUPABASE_PUBLISHABLE_KEY')
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
    const language = input.language ?? 'en'
    const market = input.market ?? 'General'
    if (typeof idea !== 'string' || idea.trim().length < 10 || idea.length > 500 ||
        typeof platform !== 'string' || !['Instagram', 'LinkedIn', 'Facebook', 'X'].includes(platform) ||
        typeof tone !== 'string' || !['Friendly', 'Professional', 'Bold', 'Educational'].includes(tone) ||
        typeof language !== 'string' || !['en', 'ar'].includes(language) ||
        typeof market !== 'string' || !['General', 'UAE', 'Saudi Arabia', 'Kuwait', 'Gulf'].includes(market)) return reply(400, { error: 'Invalid content brief' })
    const geminiKey = dependencies.env('GEMINI_API_KEY')
    if (!geminiKey) return reply(503, { error: 'AI service is not configured' })
    const model = dependencies.env('GEMINI_MODEL') ?? 'gemini-2.5-flash'
    if (!/^gemini-[a-z0-9.-]+$/.test(model)) return reply(503, { error: 'Invalid model configuration' })
    try {
      if (!await dependencies.consumeCredit(userId)) return reply(429, { error: 'Daily AI limit reached. Try again after midnight UTC.' })
    } catch {
      return reply(503, { error: 'AI usage checks unavailable. Please retry later.' })
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 25000)
    try {
      const response = await createGeminiProvider(dependencies.fetch, geminiKey, model).generate({ idea: idea.trim(), platform, tone, language, market }, controller.signal)
      if (!response.ok) return reply(502, { error: 'AI provider unavailable. Try again later.' })
      const result: unknown = await response.json()
      if (!isRecord(result) || !Array.isArray(result.candidates)) return reply(502, { error: 'AI returned no content' })
      const candidate: unknown = result.candidates[0]
      if (!isRecord(candidate) || candidate.finishReason !== 'STOP' || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return reply(502, { error: 'AI returned incomplete content' })
      const raw = candidate.content.parts.filter((part: unknown) => isRecord(part) && part.thought !== true && typeof part.text === 'string').map((part: Record<string, unknown>) => part.text).join('')
      const draft: unknown = JSON.parse(raw)
      if (!isRecord(draft) || typeof draft.caption !== 'string' || !draft.caption.trim() || draft.caption.length > 1500 ||
          !Array.isArray(draft.hashtags) || draft.hashtags.length < 3 || draft.hashtags.length > 8 ||
          !draft.hashtags.every((tag: unknown) => typeof tag === 'string' && /^[\p{L}\p{N}_]{1,40}$/u.test(tag)) ||
          new Set(draft.hashtags).size !== draft.hashtags.length) return reply(502, { error: 'AI response format was invalid' })
      return reply(200, { caption: draft.caption.trim(), hashtags: draft.hashtags })
    } catch {
      return reply(502, { error: 'AI generation failed. Please retry.' })
    } finally {
      // Keep the timeout active through response-body reading, not just response headers.
      clearTimeout(timeout)
    }
  }
}
