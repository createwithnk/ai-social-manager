import { env } from './runtime.ts'
import { secureURL } from './security.ts'
import type { ProviderConfig } from './providers.ts'
export function providerConfig():ProviderConfig {
  const root = secureURL(env('SUPABASE_URL'))
  return {metaId:env('META_APP_ID'),metaSecret:env('META_APP_SECRET'),graphVersion:env('META_GRAPH_VERSION'),
    linkedinId:env('LINKEDIN_CLIENT_ID'),linkedinSecret:env('LINKEDIN_CLIENT_SECRET'),linkedinVersion:env('LINKEDIN_VERSION'),
    linkedinAnalytics:env('LINKEDIN_ANALYTICS_ENABLED') === 'true',callback:new URL('/functions/v1/social-callback',root).toString()}
}
