import { appURL, authenticate, endpoint, env, json, rpc, serviceClient } from '../_shared/runtime.ts'
import { decryptToken, randomState, readJSON, RequestError, sessionId, sha256, uuid } from '../_shared/security.ts'
import { authorizationURL, readMetrics, requireProvider, type Provider } from '../_shared/providers.ts'
import { providerConfig } from '../_shared/config.ts'

Deno.serve(endpoint(async req => {
  const {user,token} = await authenticate(req)
  const body = await readJSON(req)
  const admin = serviceClient()
  const config = providerConfig()
  if (body.action === 'status') {
    const ready = (provider:Provider) => {
      try { appURL(); requireProvider(provider,config); if (!env('SOCIAL_TOKEN_ENCRYPTION_KEY')) return false; return true } catch { return false }
    }
    return json(200,{instagram:ready('instagram'),linkedin:ready('linkedin'),publishing:env('PUBLISHING_ENABLED') === 'true' && (await rpc<{publishing:boolean}>(admin,'launch_status'))?.publishing === true})
  }
  if (body.action === 'start') {
    if (!['instagram','linkedin'].includes(String(body.provider))) throw new RequestError(400,'Choose a supported account.')
    const provider = body.provider as Provider
    appURL(); requireProvider(provider,config)
    // Validate encryption configuration before issuing consent; never connect
    // an account whose returned credentials cannot be encrypted.
    const { encryptToken } = await import('../_shared/security.ts')
    await encryptToken('configuration-check',env('SOCIAL_TOKEN_ENCRYPTION_KEY'),'configuration-check')
    const state = randomState()
    const started = await rpc<boolean>(admin,'service_oauth_start',{hash:await sha256(state),uid:user.id,sid:sessionId(token),provider_name:provider})
    if (!started) throw new RequestError(429,'Wait before starting another account connection.')
    return json(200,{url:authorizationURL(provider,config,state)})
  }
  if (body.action === 'disconnect') {
    if (!uuid(body.connectionId)) throw new RequestError(400,'Choose an account.')
    const removed = await rpc<boolean>(admin,'service_disconnect',{cid:body.connectionId,uid:user.id})
    if (!removed) throw new RequestError(409,'This account is unavailable or a post is processing. Refresh and retry later.')
    return json(200,{disconnected:true})
  }
  if (body.action === 'metrics') {
    if (!uuid(body.jobId)) throw new RequestError(400,'Choose a published post.')
    const allowed = await rpc<boolean>(admin,'service_action_quota',{uid:user.id,kind:'analytics',maximum:30})
    if (!allowed) throw new RequestError(429,'Daily analytics refresh limit reached.')
    const {data:job,error} = await admin.from('publication_jobs').select('id,connection_id,provider_post_id,status').eq('id',body.jobId).eq('user_id',user.id).maybeSingle()
    if (error || !job || job.status !== 'published' || !job.provider_post_id) throw new RequestError(404,'Published post unavailable.')
    const {data:account} = await admin.from('social_connections').select('*').eq('id',job.connection_id).eq('user_id',user.id).maybeSingle()
    if (!account || account.status !== 'connected' || Date.parse(account.expires_at) <= Date.now()) throw new RequestError(400,'Reconnect the social account first.')
    const ciphertext = await rpc<string>(admin,'service_read_credential',{cid:account.id})
    const secret = await decryptToken(ciphertext,env('SOCIAL_TOKEN_ENCRYPTION_KEY'),`${account.id}:${user.id}:${account.provider}`)
    const metrics = await readMetrics(account.provider,job.provider_post_id,secret,account.scopes,config)
    if (Object.values(metrics).every(value => value === null)) throw new RequestError(502,'The provider did not return available metrics. Try again later.')
    const {error:saveError} = await admin.from('post_metrics').insert({user_id:user.id,job_id:job.id,source:account.provider,...metrics})
    if (saveError) throw new RequestError(503,'Metrics could not be saved. Retry later.')
    return json(200,{refreshed:true})
  }
  throw new RequestError(400,'Unknown account action.')
}))
