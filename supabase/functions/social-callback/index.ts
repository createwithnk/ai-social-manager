import { appURL, env, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { encryptToken, sha256 } from '../_shared/security.ts'
import { exchangeAccount, type Provider } from '../_shared/providers.ts'
import { providerConfig } from '../_shared/config.ts'

// Gateway JWT verification is intentionally off for an OAuth GET callback.
// A 256-bit random state, stored only as a hash, is atomically consumed once.
// The originating Auth session must still exist; no user ID comes from query.
Deno.serve(async req => {
  if (req.method !== 'GET') return json(405,{error:'Use the account connection flow.'})
  let destination:URL
  try { destination = appURL() } catch { return json(503,{error:'Website setup is pending.'}) }
  destination.search = '?screen=settings&connection=failed'
  try {
    const url = new URL(req.url); const state = url.searchParams.get('state') ?? ''; const code = url.searchParams.get('code') ?? ''
    if (!/^[0-9a-f]{64}$/.test(state) || code.length < 1 || code.length > 4096 || url.searchParams.has('error')) throw new Error()
    const admin = serviceClient()
    const pending = await rpc<{user_id:string;provider:Provider} | null>(admin,'service_oauth_take',{hash:await sha256(state)})
    if (!pending) throw new Error()
    const account = await exchangeAccount(pending.provider,code,providerConfig())
    const {data:existing,error} = await admin.from('social_connections').select('id').eq('user_id',pending.user_id).eq('provider',pending.provider).maybeSingle()
    if (error) throw new Error()
    const id = existing?.id ?? crypto.randomUUID()
    const encrypted = await encryptToken(account.token,env('SOCIAL_TOKEN_ENCRYPTION_KEY'),`${id}:${pending.user_id}:${pending.provider}`)
    await rpc(admin,'service_connect_account',{cid:id,uid:pending.user_id,provider_name:pending.provider,remote_id:account.id,display_name:account.name,granted_scopes:account.scopes,expiry:new Date(Date.now() + account.expiresIn * 1000).toISOString(),encrypted})
    destination.search = '?screen=settings&connection=connected'
  } catch { /* Never reflect authorization codes, tokens or provider error text. */ }
  return new Response(null,{status:303,headers:{Location:destination.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})
})
