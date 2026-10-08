import { readBody, RequestError, secureURL } from './security.ts'
export type Provider = 'instagram' | 'linkedin'
export interface ProviderConfig { metaId:string; metaSecret:string; graphVersion:string; linkedinId:string; linkedinSecret:string; linkedinVersion:string; linkedinAnalytics:boolean; callback:string }
export interface Account { id:string; name:string; token:string; expiresIn:number; scopes:string[] }
export class ProviderError extends Error { constructor(public status:number) { super('Provider request failed.') } }
export const object = (value:unknown):Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {}
export function text(value:unknown):string { if (typeof value !== 'string' || !value || value.length > 16000) throw new RequestError(502,'The provider returned an invalid response.'); return value }
export function count(value:unknown):number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null }
const hosts = new Set(['graph.facebook.com','www.linkedin.com','api.linkedin.com','api.razorpay.com'])
export async function providerRequest(url:string, options:RequestInit, fetcher:typeof fetch = fetch) {
  const target = secureURL(url)
  if (!hosts.has(target.hostname) || target.port) throw new RequestError(502,'Untrusted provider URL.')
  const response = await fetcher(target.toString(),{...options,redirect:'error',signal:AbortSignal.timeout(25000)})
  if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status) }
  return response
}
export async function providerJSON(url:string, options:RequestInit, fetcher:typeof fetch = fetch) {
  const response = await providerRequest(url,options,fetcher)
  const raw = await readBody(response,128 * 1024)
  try { return {response,body:object(JSON.parse(new TextDecoder().decode(raw)))} } catch { throw new RequestError(502,'The provider returned an invalid response.') }
}
export function requireProvider(provider:Provider, config:ProviderConfig) {
  if (provider === 'instagram' ? !config.metaId || !config.metaSecret || !/^v\d+\.0$/.test(config.graphVersion) : !config.linkedinId || !config.linkedinSecret || !/^20\d{4}$/.test(config.linkedinVersion)) throw new RequestError(503,'This social app needs its server account settings first.')
}
export function scopesFor(provider:Provider, config:ProviderConfig) {
  return provider === 'instagram' ? ['instagram_basic','instagram_content_publish','pages_show_list','pages_read_engagement'] : ['openid','profile','w_member_social',...(config.linkedinAnalytics ? ['r_member_postAnalytics'] : [])]
}
export function authorizationURL(provider:Provider, config:ProviderConfig, state:string) {
  requireProvider(provider,config)
  const url = new URL(provider === 'instagram' ? `https://www.facebook.com/${config.graphVersion}/dialog/oauth` : 'https://www.linkedin.com/oauth/v2/authorization')
  url.searchParams.set('client_id',provider === 'instagram' ? config.metaId : config.linkedinId)
  url.searchParams.set('redirect_uri',config.callback); url.searchParams.set('response_type','code'); url.searchParams.set('state',state)
  url.searchParams.set('scope',scopesFor(provider,config).join(provider === 'instagram' ? ',' : ' '))
  return url.toString()
}
export async function exchangeAccount(provider:Provider, code:string, config:ProviderConfig, fetcher:typeof fetch = fetch):Promise<Account> {
  requireProvider(provider,config)
  if (provider === 'linkedin') {
    const {body} = await providerJSON('https://www.linkedin.com/oauth/v2/accessToken',{ method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:config.callback,client_id:config.linkedinId,client_secret:config.linkedinSecret}) },fetcher)
    const token = text(body.access_token)
    const {body:profile} = await providerJSON('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:`Bearer ${token}`}},fetcher)
    const expiry = count(body.expires_in)
    if (!expiry || expiry > 366 * 86400 || !/^[A-Za-z0-9_-]{1,150}$/.test(text(profile.sub))) throw new RequestError(502,'Invalid social account response.')
    const scopes = typeof body.scope === 'string' ? body.scope.split(/[ ,]+/).filter(Boolean) : []
    if (!scopes.includes('w_member_social')) throw new RequestError(400,'Grant the requested posting permission, then reconnect.')
    return {id:text(profile.sub),name:text(profile.name).slice(0,200),token,expiresIn:expiry,scopes}
  }
  const tokenURL = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`)
  tokenURL.search = new URLSearchParams({client_id:config.metaId,client_secret:config.metaSecret,redirect_uri:config.callback,code}).toString()
  const {body:short} = await providerJSON(tokenURL.toString(),{},fetcher)
  tokenURL.search = new URLSearchParams({grant_type:'fb_exchange_token',client_id:config.metaId,client_secret:config.metaSecret,fb_exchange_token:text(short.access_token)}).toString()
  const {body:long} = await providerJSON(tokenURL.toString(),{},fetcher)
  const userToken = text(long.access_token); const expiry = count(long.expires_in)
  if (!expiry || expiry > 366 * 86400) throw new RequestError(502,'Invalid social token expiry.')
  const pagesURL = new URL(`https://graph.facebook.com/${config.graphVersion}/me/accounts`)
  pagesURL.search = new URLSearchParams({fields:'id,name,access_token,instagram_business_account{id,username}',limit:'100'}).toString()
  const {body:pages} = await providerJSON(pagesURL.toString(),{headers:{Authorization:`Bearer ${userToken}`}},fetcher)
  const candidates = Array.isArray(pages.data) ? pages.data.map(object).filter(page => object(page.instagram_business_account).id) : []
  // Do not guess an identity when several Pages were authorized or pagination
  // omitted more candidates. Select only one eligible Page in Meta consent.
  if (candidates.length !== 1 || object(pages.paging).next) throw new RequestError(400,'Reconnect and select exactly one Page linked to your Instagram professional account.')
  const page = candidates[0]; const instagram = object(page.instagram_business_account)
  const id = text(instagram.id)
  if (!/^\d{1,30}$/.test(id)) throw new RequestError(502,'Invalid Instagram account.')
  // Confirm all requested permissions were granted rather than infer them from
  // a token that might have been returned after partial consent.
  const {body:permissions} = await providerJSON(`https://graph.facebook.com/${config.graphVersion}/me/permissions`,{headers:{Authorization:`Bearer ${userToken}`}},fetcher)
  const scopes = Array.isArray(permissions.data) ? permissions.data.map(object).filter(p => p.status === 'granted').map(p => text(p.permission)) : []
  if (!scopesFor(provider,config).every(scope => scopes.includes(scope))) throw new RequestError(400,'Grant the requested permissions, then reconnect.')
  return {id,name:text(instagram.username ?? page.name).slice(0,200),token:text(page.access_token),expiresIn:expiry,scopes}
}
export function linkedInHeaders(token:string, config:ProviderConfig) {
  return {Authorization:`Bearer ${token}`,'LinkedIn-Version':config.linkedinVersion,'X-Restli-Protocol-Version':'2.0.0','Content-Type':'application/json'}
}
export interface Snapshot { caption:string; hashtags:string[]; media:null | {path:string;type:string;size:number;name:string}; platform:string }
export function validateSnapshot(value:unknown, userId:string, provider:Provider):Snapshot {
  const p = object(value)
  if (typeof p.caption !== 'string' || !p.caption.trim() || !Array.isArray(p.hashtags) || p.hashtags.length > 8 || !p.hashtags.every(t => typeof t === 'string' && /^[\p{L}\p{M}\p{N}_]{1,80}$/u.test(t)) || p.platform !== (provider === 'instagram' ? 'Instagram' : 'LinkedIn')) throw new RequestError(400,'Review this post again.')
  const caption = `${p.caption}\n\n${p.hashtags.map(t => `#${t}`).join(' ')}`.trim()
  if ([...caption].length > (provider === 'instagram' ? 2200 : 3000)) throw new RequestError(400,'Shorten the approved caption first.')
  if (p.media) {
    const m = object(p.media)
    if (typeof m.path !== 'string' || !m.path.startsWith(`${userId}/`) || m.path.split('/').length !== 2 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(m.path.split('/')[1]) || typeof m.type !== 'string' || typeof m.name !== 'string' || m.name.length > 200 || !Number.isSafeInteger(m.size) || Number(m.size) < 1 || Number(m.size) > 10485760) throw new RequestError(400,'Invalid post attachment.')
    const supported = provider === 'instagram' ? ['image/jpeg','video/mp4'] : ['image/jpeg','image/png','video/mp4']
    if (!supported.includes(m.type)) throw new RequestError(400,`Use ${provider === 'instagram' ? 'a JPEG image or MP4 Reel' : 'a JPEG/PNG image or MP4 video'} and approve the revised post.`)
  } else if (provider === 'instagram') throw new RequestError(400,'Instagram requires a JPEG image or MP4 Reel.')
  return {caption,hashtags:[],media:p.media ? p.media as Snapshot['media'] : null,platform:p.platform as string}
}
export async function readMetrics(provider:Provider, postId:string, token:string, scopes:string[], config:ProviderConfig, fetcher:typeof fetch = fetch) {
  requireProvider(provider,config)
  if (provider === 'instagram') {
    if (!/^\d{1,30}$/.test(postId)) throw new RequestError(400,'Invalid published post.')
    const {body} = await providerJSON(`https://graph.facebook.com/${config.graphVersion}/${postId}?fields=like_count,comments_count`,{headers:{Authorization:`Bearer ${token}`}},fetcher)
    return {impressions:null,reactions:count(body.like_count),comments:count(body.comments_count),shares:null}
  }
  if (!scopes.includes('r_member_postAnalytics')) throw new RequestError(403,'LinkedIn analytics requires approved r_member_postAnalytics permission. Reconnect after it is granted.')
  if (!/^urn:li:(ugcPost|share):\d+$/.test(postId)) throw new RequestError(400,'Invalid published post.')
  const result:Record<string,number | null> = {}
  for (const [name,query] of Object.entries({impressions:'IMPRESSION',reactions:'REACTION',comments:'COMMENT',shares:'RESHARE'})) {
    const entityType = postId.includes(':ugcPost:') ? 'ugc' : 'share'
    const url = `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=(${entityType}:${encodeURIComponent(postId)})&queryType=${query}&aggregation=TOTAL`
    const {body} = await providerJSON(url,{headers:linkedInHeaders(token,config)},fetcher)
    result[name] = Array.isArray(body.elements) && body.elements.length === 1 ? count(object(body.elements[0]).count) : null
  }
  return result
}
