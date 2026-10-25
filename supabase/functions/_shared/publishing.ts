import { linkedInHeaders, object, providerJSON, providerRequest, ProviderError, text, validateSnapshot, type Provider, type ProviderConfig, type Snapshot } from './providers.ts'
import { RequestError, secureURL } from './security.ts'
import { mediaSignatureMatches } from './media-signature.ts'
export interface Job { id:string; user_id:string; snapshot:unknown; container_id:string | null; attempts:number }
export interface Connection { provider:Provider; account_id:string }
export interface PublishResult { outcome:'queued'|'published'|'failed'|'uncertain'; remoteId?:string; container?:string; code?:string }
export interface MediaAccess { download:(media:NonNullable<Snapshot['media']>)=>Promise<Blob>; sign:(media:NonNullable<Snapshot['media']>)=>Promise<string> }
function uploadURL(raw:unknown) {
  const url = secureURL(text(raw))
  if (url.hostname !== 'www.linkedin.com' || url.port || !url.pathname.startsWith('/dms-uploads/')) throw new RequestError(502,'Untrusted upload URL.')
  return url.toString()
}
async function uploadLinkedIn(p:Snapshot, token:string, owner:string, config:ProviderConfig, access:MediaAccess, fetcher:typeof fetch) {
  const m = p.media!; const file = await access.download(m)
  if (file.size !== m.size || file.type.split(';')[0] !== m.type) throw new RequestError(400,'Attachment changed. Review it again.')
  if (!mediaSignatureMatches(new Uint8Array(await file.slice(0,16).arrayBuffer()),m.type)) throw new RequestError(400,'Invalid attachment contents.')
  const headers = linkedInHeaders(token,config)
  if (m.type.startsWith('image/')) {
    const {body} = await providerJSON('https://api.linkedin.com/rest/images?action=initializeUpload',{method:'POST',headers,body:JSON.stringify({initializeUploadRequest:{owner}})},fetcher)
    const value = object(body.value); const urn = text(value.image)
    if (!/^urn:li:image:[A-Za-z0-9_-]+$/.test(urn)) throw new RequestError(502,'Invalid uploaded image.')
    const result = await providerRequest(uploadURL(value.uploadUrl),{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream'},body:file},fetcher)
    await result.body?.cancel()
    return urn
  }
  const {body} = await providerJSON('https://api.linkedin.com/rest/videos?action=initializeUpload',{method:'POST',headers,body:JSON.stringify({initializeUploadRequest:{owner,fileSizeBytes:file.size,uploadCaptions:false,uploadThumbnail:false}})},fetcher)
  const value = object(body.value); const video = text(value.video)
  if (!/^urn:li:video:[A-Za-z0-9_-]+$/.test(video) || !Array.isArray(value.uploadInstructions) || value.uploadInstructions.length < 1 || value.uploadInstructions.length > 3) throw new RequestError(502,'Invalid video upload instructions.')
  const partIds:string[] = []; let nextByte = 0
  for (const item of value.uploadInstructions) {
    const part = object(item); const first = Number(part.firstByte); const last = Number(part.lastByte)
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first !== nextByte || last < first || last >= file.size) throw new RequestError(502,'Invalid video upload range.')
    const result = await providerRequest(uploadURL(part.uploadUrl),{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(first,last + 1)},fetcher)
    partIds.push(text(result.headers.get('etag')).replace(/^"|"$/g,'')); await result.body?.cancel(); nextByte = last + 1
  }
  if (nextByte !== file.size || typeof value.uploadToken !== 'string') throw new RequestError(502,'Incomplete video upload.')
  const result = await providerRequest('https://api.linkedin.com/rest/videos?action=finalizeUpload',{method:'POST',headers,body:JSON.stringify({finalizeUploadRequest:{video,uploadToken:value.uploadToken,uploadedPartIds:partIds}})},fetcher)
  await result.body?.cancel()
  return video
}
// beforePublish rechecks both launch gates immediately before the irreversible
// API call. Final-response loss is uncertain, never an automatic retry.
export async function processPublication(job:Job, connection:Connection, token:string, config:ProviderConfig, access:MediaAccess, beforePublish:()=>Promise<void>, fetcher:typeof fetch = fetch):Promise<PublishResult> {
  let finalRequest = false
  try {
    const p = validateSnapshot(job.snapshot,job.user_id,connection.provider)
    if (connection.provider === 'instagram') {
      if (!/^\d{1,30}$/.test(connection.account_id)) throw new RequestError(400,'Invalid account.')
      const root = `https://graph.facebook.com/${config.graphVersion}`
      if (!job.container_id) {
        const media = p.media!
        const params = new URLSearchParams({caption:p.caption})
        params.set(media.type === 'video/mp4' ? 'video_url' : 'image_url',await access.sign(media))
        if (media.type === 'video/mp4') { params.set('media_type','REELS'); params.set('share_to_feed','true') }
        const {body} = await providerJSON(`${root}/${connection.account_id}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded'},body:params},fetcher)
        const container = text(body.id)
        if (!/^\d{1,30}$/.test(container)) throw new RequestError(502,'Invalid media container.')
        return {outcome:'queued',container}
      }
      if (!/^\d{1,30}$/.test(job.container_id)) throw new RequestError(400,'Invalid media container.')
      const {body:status} = await providerJSON(`${root}/${job.container_id}?fields=status_code`,{headers:{Authorization:`Bearer ${token}`}},fetcher)
      if (status.status_code === 'PUBLISHED') return {outcome:'uncertain',code:'container_already_published'}
      if (status.status_code !== 'FINISHED') {
        if (status.status_code === 'IN_PROGRESS' && job.attempts < 20) return {outcome:'queued',container:job.container_id}
        return {outcome:'failed',code:'media_processing_failed'}
      }
      await beforePublish(); finalRequest = true
      const {body} = await providerJSON(`${root}/${connection.account_id}/media_publish`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:job.container_id})},fetcher)
      const remoteId = text(body.id)
      if (!/^\d{1,30}$/.test(remoteId)) throw new Error('Missing published ID')
      return {outcome:'published',remoteId,container:job.container_id}
    }
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(connection.account_id)) throw new RequestError(400,'Invalid account.')
    const owner = `urn:li:person:${connection.account_id}`
    if (p.media && !job.container_id) return {outcome:'queued',container:await uploadLinkedIn(p,token,owner,config,access,fetcher)}
    if (p.media && !/^urn:li:(image|video):[A-Za-z0-9_-]+$/.test(job.container_id ?? '')) throw new RequestError(400,'Invalid media asset.')
    if (job.container_id?.startsWith('urn:li:video:')) {
      const {body:video} = await providerJSON(`https://api.linkedin.com/rest/videos/${encodeURIComponent(job.container_id)}`,{headers:linkedInHeaders(token,config)},fetcher)
      if (video.status !== 'AVAILABLE') {
        if (['PROCESSING','WAITING_UPLOAD'].includes(String(video.status)) && job.attempts < 20) return {outcome:'queued',container:job.container_id}
        return {outcome:'failed',code:'media_processing_failed'}
      }
    }
    const payload = {author:owner,commentary:p.caption,visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false,...(p.media ? {content:{media:{id:job.container_id,title:p.media.name.slice(0,120)}}} : {})}
    await beforePublish(); finalRequest = true
    const result = await providerRequest('https://api.linkedin.com/rest/posts',{method:'POST',headers:linkedInHeaders(token,config),body:JSON.stringify(payload)},fetcher)
    const remoteId = result.headers.get('x-restli-id'); await result.body?.cancel()
    if (!remoteId || !/^urn:li:(ugcPost|share):\d+$/.test(remoteId)) throw new Error('Missing published ID')
    return {outcome:'published',remoteId,container:job.container_id ?? undefined}
  } catch (error) {
    // A documented 4xx refusal (except timeout) did not publish. Network errors,
    // 5xx responses and malformed successful final responses need human review.
    const refused = error instanceof ProviderError && error.status >= 400 && error.status < 500 && error.status !== 408
    return {outcome:finalRequest && !refused ? 'uncertain' : 'failed',code:error instanceof ProviderError ? `provider_${error.status}` : error instanceof RequestError ? 'validation_or_setup' : 'request_failed'}
  }
}
