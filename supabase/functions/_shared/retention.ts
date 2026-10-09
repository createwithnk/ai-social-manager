import { secureURL, RequestError } from './security.ts'
export interface MediaDeleteClaim { id:string; object_id:string; bucket_id:'post-media'; name:string; owner_id:string; lease_id:string }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function mediaDeleteClaim(value:unknown):MediaDeleteClaim | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(503,'Retention requires operator review.')
  const q=value as Record<string,unknown>
  if (['id','object_id','owner_id','lease_id'].some(key=>typeof q[key] !== 'string' || !uuid.test(q[key] as string))
      || q.bucket_id !== 'post-media' || typeof q.name !== 'string'
      || !new RegExp(`^${q.owner_id}/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$`).test(q.name)) throw new RequestError(503,'Retention requires operator review.')
  return q as unknown as MediaDeleteClaim
}
// The pinned Storage SDK sends DELETE once. Bound every worker HTTP call, keep
// requests on the configured Supabase origin, and reject HTTP redirects.
export function retentionFetch(project:string):typeof fetch {
  const root=secureURL(project)
  if (root.pathname !== '/' || root.search || root.hash) throw new RequestError(503,'Retention server setup is pending.')
  return (input,init) => {
    const request=new Request(input,init), url=secureURL(request.url)
    if (url.origin !== root.origin) throw new RequestError(503,'Retention server setup is pending.')
    return fetch(request,{redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(10_000)])})
  }
}
