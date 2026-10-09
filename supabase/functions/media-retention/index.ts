import { env, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { constantTimeEqual, RequestError } from '../_shared/security.ts'
import { mediaDeleteClaim, retentionFetch } from '../_shared/retention.ts'

// Prepared server-to-server worker. No deployment, secret, schedule or gate is
// created. Quarantine itself is a separate exact-object operator RPC.
Deno.serve(async req => {
  if (req.method !== 'POST') return json(405,{error:'Use POST.'})
  if (req.headers.get('origin')) return json(403,{error:'Server requests only.'})
  const expected=env('MEDIA_RETENTION_SECRET')
  if (!/^[0-9a-f]{64}$/.test(expected) || !constantTimeEqual(req.headers.get('authorization') ?? '',`Bearer ${expected}`)) return json(401,{error:'Retention authentication required.'})
  if (env('MEDIA_RETENTION_ENABLED') !== 'true') return json(423,{error:'Retention is disabled.'})
  try {
    const admin=serviceClient(retentionFetch(env('SUPABASE_URL')))
    if (!await rpc<boolean>(admin,'service_media_retention_enabled')) return json(423,{error:'Retention is disabled.'})
    const claim=mediaDeleteClaim(await rpc<unknown>(admin,'service_claim_media_delete'))
    if (!claim) return json(200,{processed:false})
    if (env('MEDIA_RETENTION_ENABLED') !== 'true' || !await rpc<boolean>(admin,'service_begin_media_delete',{qid:claim.id,lease:claim.lease_id})) return json(409,{error:'Retention requires operator review.'})
    let deleted=false
    try {
      const {data,error}=await admin.storage.from('post-media').remove([claim.name])
      deleted=!error && Array.isArray(data) && data.length===1 && data[0].id===claim.object_id && data[0].name===claim.name
    } catch { /* A timeout is uncertain; this path is never automatically retried. */ }
    const verified=await rpc<boolean>(admin,'service_finish_media_delete',{qid:claim.id,lease:claim.lease_id,deleted})
    if (!deleted || !verified) return json(503,{error:'Retention requires operator review.'})
    return json(200,{processed:true,id:claim.id,status:'deleted'})
  } catch(error) {return json(error instanceof RequestError ? error.status : 500,{error:error instanceof RequestError ? error.message : 'Retention requires operator review.'})}
})
