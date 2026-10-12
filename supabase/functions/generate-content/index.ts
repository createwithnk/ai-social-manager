import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createHandler } from './handler.ts'

Deno.serve(createHandler({
  env: (name) => Deno.env.get(name),
  authenticate: async (url, key, token) => {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    })
    const { data: { user }, error } = await client.auth.getUser(token)
    return !error && user && !user.is_anonymous && user.email_confirmed_at ? user.id : null
  },
  consumeCredit: async (userId) => {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Usage service not configured')
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    })
    const { data, error } = await client.rpc('consume_ai_credit', { p_user_id: userId })
    if (error || typeof data !== 'boolean') throw new Error('Usage check failed')
    return data
  },
  fetch,
}))
