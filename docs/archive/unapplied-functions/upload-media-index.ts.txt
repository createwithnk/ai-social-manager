import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createUploadHandler } from './handler.ts'

function client(keyName: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get(keyName)
  if (!url || !key) throw new Error('Storage service not configured')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  })
}
Deno.serve(createUploadHandler({
  env: (name) => Deno.env.get(name),
  authenticate: async (token) => {
    const { data: { user }, error } = await client('SUPABASE_ANON_KEY').auth.getUser(token)
    return !error && user && !user.is_anonymous && user.email_confirmed_at ? user.id : null
  },
  reserve: async (userId, size, extension) => {
    const { data, error } = await client('SUPABASE_SERVICE_ROLE_KEY').rpc('reserve_media_upload', { p_user_id: userId, p_bytes: size, p_extension: extension })
    if (error) throw new Error('Reservation failed')
    if (data === null) return null
    if (typeof data?.id !== 'string' || typeof data.path !== 'string') throw new Error('Invalid reservation')
    return { id: data.id, path: data.path }
  },
  upload: async (path, bytes, contentType) => {
    const { error } = await client('SUPABASE_SERVICE_ROLE_KEY').storage.from('aasiflow-media').upload(path, bytes, { contentType, upsert: false, cacheControl: '300' })
    if (error) throw new Error('Upload failed')
  },
  finish: async (id, succeeded) => {
    const { error } = await client('SUPABASE_SERVICE_ROLE_KEY').rpc('finish_media_upload', { p_id: id, p_succeeded: succeeded })
    if (error) throw new Error('Tracking failed')
  },
}))
