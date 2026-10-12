import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createHandler } from './handler.ts'
import { mediaSignatureMatches } from '../_shared/media-signature.ts'

function publicKey() {
  try { const key = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default; if (key) return key as string } catch { /* Use legacy configuration when the dictionary is absent. */ }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
}
function userClient(url: string, key: string, token: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  })
}
Deno.serve(createHandler({
  env: (name) => Deno.env.get(name),
  authenticate: async (url, key, token) => {
    const client = userClient(url, key, token)
    const { data: { user }, error } = await client.auth.getUser(token)
    if (error || !user || user.is_anonymous || !user.email_confirmed_at) return null
    const { data: active, error: sessionError } = await client.rpc('has_active_session')
    if (sessionError) throw new Error('Session security unavailable')
    return active === true ? user.id : null
  },
  consumeCredit: async (_userId, token) => {
    const client = userClient(Deno.env.get('SUPABASE_URL') ?? '', publicKey(), token)
    const { data, error } = await client.rpc('consume_ai_quota')
    if (error || typeof data !== 'boolean') throw new Error('Usage check failed')
    return data
  },
  readMedia: async (path, type, token) => {
    const client = userClient(Deno.env.get('SUPABASE_URL') ?? '', publicKey(), token)
    const { data: file, error } = await client.storage.from('post-media').download(path)
    if (error || !file || !file.size || file.size > 10485760 || file.type.split(';')[0] !== type) throw new Error('Attachment unavailable')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!mediaSignatureMatches(bytes.subarray(0,16), type)) throw new Error('Attachment signature mismatch')
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    return { mimeType: type, data: btoa(binary) }
  },
  fetch,
}))
