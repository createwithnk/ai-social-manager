import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { RequestError, secureURL } from './security.ts'
export const env = (key: string) => Deno.env.get(key) ?? ''
function configuredKey(dictionary: string, fallback: string) {
  try { return JSON.parse(env(dictionary) || '{}').default || env(fallback) } catch { return env(fallback) }
}
export function userClient(authorization: string) {
  return createClient(env('SUPABASE_URL'),configuredKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{
    auth:{persistSession:false,autoRefreshToken:false}, global:{headers:{Authorization:authorization}},
  })
}
export function serviceClient(fetcher?: typeof fetch) {
  const key = configuredKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new RequestError(503,'Server account setup is pending.')
  return createClient(env('SUPABASE_URL'),key,{ auth:{persistSession:false,autoRefreshToken:false},...(fetcher ? {global:{fetch:fetcher}} : {}) })
}
export async function authenticate(req: Request) {
  const authorization = req.headers.get('authorization') ?? ''
  if (!/^Bearer \S+$/.test(authorization)) throw new RequestError(401,'Sign in first.')
  const client = userClient(authorization)
  const { data:{user},error } = await client.auth.getUser(authorization.slice(7))
  if (error || !user) throw new RequestError(401,'Sign in again.')
  const {data:active,error:sessionError} = await client.rpc('has_active_session')
  if (sessionError || !active) throw new RequestError(401,'Your session ended. Sign in again.')
  return { client,user,token:authorization.slice(7) }
}
export async function rpc<T>(client: SupabaseClient, name: string, args?: Record<string,unknown>): Promise<T> {
  const {data,error} = await client.rpc(name,args)
  if (error) throw new RequestError(503,'This action could not be completed. Refresh and retry.')
  return data as T
}
export async function gate(client: SupabaseClient, mode:'publishing'|'billing') {
  if (env(mode === 'publishing' ? 'PUBLISHING_ENABLED' : 'BILLING_ENABLED') !== 'true') throw new RequestError(423,`${mode === 'billing' ? 'Payments' : 'Publishing'} require owner permission.`)
  const controls = await rpc<{publishing:boolean;billing:boolean}>(client,'launch_status')
  if (!controls?.[mode]) throw new RequestError(423,`${mode === 'billing' ? 'Payments' : 'Publishing'} require owner permission.`)
}
export function appURL() {
  let url: URL
  try { url = secureURL(env('APP_URL')) } catch { throw new RequestError(503,'Website URL setup is pending.') }
  if (url.pathname !== '/' || url.search || url.hash) throw new RequestError(503,'Website URL setup is pending.')
  return url
}
export function json(status:number,body:unknown,headers:Record<string,string> = {}) {
  return new Response(JSON.stringify(body),{ status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers} })
}
export function endpoint(handler:(req:Request)=>Promise<Response>) {
  return async (req:Request) => {
    const origin = req.headers.get('origin') ?? ''
    const allowed = env('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean)
    const headers = {'Access-Control-Allow-Origin':allowed.includes(origin) ? origin : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}
    if (origin && !allowed.includes(origin)) return json(403,{error:'This website is not enabled.'},headers)
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers})
    if (req.method !== 'POST') return json(405,{error:'Use POST.'},headers)
    let response:Response
    try { response = await handler(req) } catch (error) { response = json(error instanceof RequestError ? error.status : 500,{error:error instanceof RequestError ? error.message : 'The action failed. Try again later.'}) }
    for (const [key,value] of Object.entries(headers)) response.headers.set(key,value)
    return response
  }
}
