import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedPlatforms = ['Instagram', 'LinkedIn', 'Facebook', 'X']
const allowedTones = ['Friendly', 'Professional', 'Bold', 'Educational']

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? ''
  const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin' }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' })
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply(415, { error: 'Expected JSON' })
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return reply(401, { error: 'Sign in required' })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!url || !key || !geminiKey) return reply(503, { error: 'AI service is not configured' })
  const client = createClient(url, key, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) return reply(401, { error: 'Invalid session' })
  let input: unknown
  try { input = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
  if (!input || typeof input !== 'object') return reply(400, { error: 'Invalid request' })
  const { idea, platform, tone } = input as Record<string, unknown>
  if (typeof idea !== 'string' || idea.trim().length < 10 || idea.length > 500 ||
      !allowedPlatforms.includes(String(platform)) || !allowedTones.includes(String(tone))) {
    return reply(400, { error: 'Invalid content brief' })
  }
  try {
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
    if (!/^gemini-[a-z0-9.-]+$/.test(model)) return reply(503, { error: 'Invalid model configuration' })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)
    let response: Response
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Write one ${platform} social media post in a ${tone} tone about: ${idea.trim()}. Return ONLY a JSON object with "caption" (string, max 1500 chars) and "hashtags" (array of 3-8 plain tag strings without #). Never include instructions to auto-publish.` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800 }
        })
      })
    } finally { clearTimeout(timeout) }
    if (!response.ok) return reply(502, { error: 'AI provider unavailable. Try again later.' })
    const result = await response.json()
    const raw = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('')
    if (typeof raw !== 'string') return reply(502, { error: 'AI returned no content' })
    const draft = JSON.parse(raw)
    if (typeof draft?.caption !== 'string' || !draft.caption.trim() || draft.caption.length > 1500 ||
        !Array.isArray(draft.hashtags) || draft.hashtags.length > 12 ||
        !draft.hashtags.every((tag: unknown) => typeof tag === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(tag))) {
      return reply(502, { error: 'AI response format was invalid' })
    }
    return reply(200, { caption: draft.caption, hashtags: draft.hashtags })
  } catch {
    return reply(502, { error: 'AI generation failed. Please retry.' })
  }
})
