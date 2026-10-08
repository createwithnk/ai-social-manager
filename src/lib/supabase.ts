import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const usesExampleValues =
  supabaseUrl?.includes('your-project.supabase.co') ||
  supabaseAnonKey === 'your-anon-key'

const hasSupabaseConfiguration = Boolean(
  supabaseUrl && supabaseAnonKey && !usesExampleValues,
)

function createSupabaseClient(): { client: SupabaseClient | null; error: string | null } {
  if (!hasSupabaseConfiguration) return { client: null, error: null }

  try {
    const url = new URL(supabaseUrl!)
    if (url.pathname !== '/' || url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('Unsupported Supabase URL protocol')
    }

    return { client: createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    }), error: null }
  } catch {
    return {
      client: null,
      error: 'Supabase configuration is invalid. Check the URL and anonymous key, then try again.',
    }
  }
}

const supabaseClient = createSupabaseClient()

export const supabase = supabaseClient.client
export const supabaseConfigurationError = supabaseClient.error
export const isSupabaseConfigured = Boolean(supabase)
