import { env, gate, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { constantTimeEqual, decryptToken, RequestError } from '../_shared/security.ts'
import { processPublication, type Job } from '../_shared/publishing.ts'
import { requireProvider } from '../_shared/providers.ts'
import { providerConfig } from '../_shared/config.ts'
import { mediaSignatureMatches } from '../_shared/media-signature.ts'

// No Cron job is created by this repository. Gateway JWT verification is off
// only for this independently authenticated, server-to-server worker.
Deno.serve(async req => {
  if (req.method !== 'POST') return json(405,{error:'Use POST.'})
  const expected = env('WORKER_SECRET')
  if (!/^[0-9a-f]{64}$/.test(expected) || !constantTimeEqual(req.headers.get('authorization') ?? '',`Bearer ${expected}`)) return json(401,{error:'Worker authentication required.'})
  try {
    const admin = serviceClient(); await gate(admin,'publishing')
    const config = providerConfig()
    const job = await rpc<(Job & {connection_id:string;lease_id:string}) | null>(admin,'service_claim_publication')
    if (!job) return json(200,{processed:false})
    let outcome
    try {
      const {data:connection} = await admin.from('social_connections').select('*').eq('id',job.connection_id).eq('user_id',job.user_id).maybeSingle()
      if (!connection || connection.status !== 'connected' || Date.parse(connection.expires_at) <= Date.now()) throw new Error()
      requireProvider(connection.provider,config)
      const encrypted = await rpc<string>(admin,'service_read_credential',{cid:connection.id})
      const token = await decryptToken(encrypted,env('SOCIAL_TOKEN_ENCRYPTION_KEY'),`${connection.id}:${job.user_id}:${connection.provider}`)
      outcome = await processPublication(job,connection,token,config,{
        download:async media => {
          const {data,error} = await admin.storage.from('post-media').download(media.path)
          if (error || !data || data.size > 10485760) throw new Error(); return data
        },
        sign:async media => {
          const {data:blob,error:downloadError} = await admin.storage.from('post-media').download(media.path)
          if (downloadError || !blob || blob.size !== media.size || blob.type.split(';')[0] !== media.type) throw new Error()
          if (!mediaSignatureMatches(new Uint8Array(await blob.slice(0,16).arrayBuffer()),media.type)) throw new Error()
          const {data,error} = await admin.storage.from('post-media').createSignedUrl(media.path,900)
          if (error || !data) throw new Error(); return data.signedUrl
        },
      },()=>gate(admin,'publishing'))
    } catch { outcome = {outcome:'failed' as const,code:'connection_or_setup'} }
    const saved = await rpc<boolean>(admin,'service_finish_publication',{jid:job.id,lease:job.lease_id,outcome:outcome.outcome,remote_id:outcome.remoteId ?? null,container:outcome.container ?? null,code:outcome.code ?? null})
    if (!saved) throw new RequestError(503,'Publication outcome needs operator review.')
    return json(200,{processed:true,id:job.id,status:outcome.outcome})
  } catch (error) { return json(error instanceof RequestError ? error.status : 500,{error:error instanceof RequestError ? error.message : 'Worker failed.'}) }
})
