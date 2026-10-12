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
    return !error && Boolean(user)
  },
  fetch,
}))
