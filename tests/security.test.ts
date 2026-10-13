import { decryptToken, encryptToken, randomState, readBody, readJSON, RequestError, sha256, verifyWebhook } from '../supabase/functions/_shared/security.ts'
import { authorizationURL, exchangeAccount, providerJSON, readMetrics, validateSnapshot, type ProviderConfig } from '../supabase/functions/_shared/providers.ts'
import { processPublication, type Job } from '../supabase/functions/_shared/publishing.ts'
import { createPaymentLink, paidEvent, readPlans, refundedEvent } from '../supabase/functions/_shared/payments.ts'
import { authenticate, endpoint, gate, json } from '../supabase/functions/_shared/runtime.ts'
import { mediaSignatureMatches } from '../supabase/functions/_shared/media-signature.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'

function assert(value:unknown, message='Assertion failed'):asserts value {if (!value) throw new Error(message)}
function equal(a:unknown,b:unknown) {assert(JSON.stringify(a) === JSON.stringify(b),`${JSON.stringify(a)} != ${JSON.stringify(b)}`)}
async function rejects(task:()=>unknown | Promise<unknown>) {let rejected=false;try{await task()}catch{rejected=true}assert(rejected,'Expected rejection')}
const config:ProviderConfig = {metaId:'test-app',metaSecret:'test-secret',graphVersion:'v25.0',linkedinId:'test-client',linkedinSecret:'test-secret',linkedinVersion:'202609',linkedinAnalytics:false,callback:'https://db.example/functions/v1/social-callback'}
const key = btoa('0123456789abcdef0123456789abcdef')
const UID='a1111111-1111-4111-8111-111111111111'
const snapshot = {caption:'Reviewed caption',hashtags:['हिन्दी','عربي'],platform:'LinkedIn',media:null}
const job:Job = {id:'job-test',user_id:UID,snapshot,container_id:null,attempts:1}
const connection = {provider:'linkedin' as const,account_id:'member123'}
const access = {download:()=>Promise.reject(new Error('Unexpected media download')),sign:()=>Promise.reject(new Error('Unexpected signed URL'))}
const fake = (responses:(Response | Error)[]) => {
  const calls:{url:string;options:RequestInit}[]=[]
  const fetcher:typeof fetch = async (input,options={}) => {calls.push({url:String(input),options});const next=responses.shift();if(next instanceof Error)throw next;assert(next,'Unexpected provider call');return next}
  return {fetcher,calls}
}

Deno.test('AES-GCM token encryption is randomized, authenticated and bound to owner/account/provider',async()=>{
  const a = await encryptToken('private-token',key,`${UID}:account:linkedin`)
  const b = await encryptToken('private-token',key,`${UID}:account:linkedin`)
  assert(a !== b);assert(!a.includes('private-token'))
  equal(await decryptToken(a,key,`${UID}:account:linkedin`),'private-token')
  await rejects(()=>decryptToken(a,key,'another-owner:account:linkedin'))
  await rejects(()=>decryptToken(a.slice(0,-4)+'abcd',key,`${UID}:account:linkedin`))
  await rejects(()=>encryptToken('private-token','short',`${UID}:account:linkedin`))
  assert(/^[a-f0-9]{64}$/.test(randomState()));equal((await sha256(randomState())).length,64)
})
Deno.test('streamed request limits reject oversized bodies without Content-Length',async()=>{
  const stream = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4096));controller.enqueue(new Uint8Array(4097));controller.close()}})
  await rejects(()=>readBody(new Request('https://app.example',{method:'POST',body:stream})))
  await rejects(()=>readJSON(new Request('https://app.example',{method:'POST',headers:{'content-type':'application/json'},body:'[]'})))
})
Deno.test('untrusted provider URLs are rejected before any fetch or credential transmission',async()=>{
  const mock = fake([])
  await rejects(()=>providerJSON('https://api.linkedin.com.evil.example/rest/posts',{headers:{Authorization:'Bearer secret'}},mock.fetcher))
  await rejects(()=>providerJSON('http://api.linkedin.com/rest/posts',{},mock.fetcher))
  await rejects(()=>providerJSON('https://attacker@api.linkedin.com/rest/posts',{},mock.fetcher))
  equal(mock.calls.length,0)
})
Deno.test('OAuth consent uses fixed callback/state and least requested scopes',()=>{
  const url = new URL(authorizationURL('linkedin',config,'test-state'))
  equal(url.hostname,'www.linkedin.com');equal(url.searchParams.get('redirect_uri'),config.callback)
  equal(url.searchParams.get('state'),'test-state');assert(!url.searchParams.get('scope')!.includes('email'));assert(!url.searchParams.get('scope')!.includes('r_member_postAnalytics'))
})
Deno.test('LinkedIn token exchange checks granted posting scope and returned identity',async()=>{
  const mock = fake([Response.json({access_token:'server-token',expires_in:3600,scope:'openid profile w_member_social'}),Response.json({sub:'member123',name:'Test Member'})])
  const account = await exchangeAccount('linkedin','single-use-code',config,mock.fetcher)
  equal(account.id,'member123');equal(account.token,'server-token');equal(mock.calls.length,2)
  assert(mock.calls[0].options.body instanceof URLSearchParams)
  const denied = fake([Response.json({access_token:'server-token',expires_in:3600,scope:'openid profile'}),Response.json({sub:'member123',name:'Test Member'})])
  await rejects(()=>exchangeAccount('linkedin','code',config,denied.fetcher))
})
Deno.test('Meta exchange rejects ambiguous Page identity instead of choosing a destination',async()=>{
  const mock = fake([Response.json({access_token:'short'}),Response.json({access_token:'long',expires_in:3600}),Response.json({data:[{instagram_business_account:{id:'11'}},{instagram_business_account:{id:'22'}}]})])
  await rejects(()=>exchangeAccount('instagram','code',config,mock.fetcher));equal(mock.calls.length,3)
})
Deno.test('publication validates caption, owner path and provider media support before network',async()=>{
  await rejects(()=>validateSnapshot({...snapshot,caption:'x'.repeat(3001)},UID,'linkedin'))
  await rejects(()=>validateSnapshot({...snapshot,media:{path:'another-user/file',type:'image/jpeg',size:3,name:'test'}},UID,'linkedin'))
  await rejects(()=>validateSnapshot({...snapshot,media:{path:`${UID}/%2e%2e`,type:'image/jpeg',size:3,name:'test'}},UID,'linkedin'))
  const mock = fake([])
  const result = await processPublication({...job,snapshot:{...snapshot,platform:'Instagram'}},{provider:'instagram',account_id:'123'},'token',config,access,async()=>{},mock.fetcher)
  equal(result.outcome,'failed');equal(mock.calls.length,0)
})
Deno.test('closed launch gate stops final publishing request',async()=>{
  const mock = fake([])
  const result = await processPublication(job,connection,'secret',config,access,async()=>{throw new RequestError(423,'Blocked')},mock.fetcher)
  equal(result.outcome,'failed');equal(mock.calls.length,0)
})
Deno.test('LinkedIn successful publish records the provider ID with required version headers',async()=>{
  const mock = fake([new Response(null,{status:201,headers:{'x-restli-id':'urn:li:share:123'}})])
  const result = await processPublication(job,connection,'secret',config,access,async()=>{},mock.fetcher)
  equal(result.outcome,'published');equal(result.remoteId,'urn:li:share:123')
  equal(new Headers(mock.calls[0].options.headers).get('LinkedIn-Version'),'202609')
  equal(mock.calls[0].options.redirect,'error')
})
Deno.test('final publish timeout, 5xx or missing provider ID is uncertain and never retried',async()=>{
  for (const response of [new Error('Network timeout'),new Response(null,{status:500}),new Response(null,{status:201})]) {
    const mock = fake([response]);const result = await processPublication(job,connection,'secret',config,access,async()=>{},mock.fetcher)
    equal(result.outcome,'uncertain');equal(mock.calls.length,1)
  }
})
Deno.test('explicit provider refusal is failed without automatic retry',async()=>{
  const mock = fake([new Response(null,{status:429})])
  const result = await processPublication(job,connection,'secret',config,access,async()=>{},mock.fetcher)
  equal(result.outcome,'failed');equal(mock.calls.length,1)
})
Deno.test('Instagram processing container is checkpointed, not published in the first step',async()=>{
  const mock = fake([Response.json({id:'456'})])
  const result = await processPublication({...job,snapshot:{...snapshot,platform:'Instagram',media:{path:`${UID}/photo`,type:'image/jpeg',size:3,name:'photo'}}},{provider:'instagram',account_id:'123'},'secret',config,{...access,sign:async()=> 'https://db.example/signed-media'},async()=>{throw new Error('Must not publish yet')},mock.fetcher)
  equal(result,{outcome:'queued',container:'456'});equal(mock.calls.length,1)
})
Deno.test('LinkedIn video upload obeys returned byte ranges, saves ETags and finalizes before publishing',async()=>{
  const bytes = new Uint8Array(12);bytes.set(new TextEncoder().encode('ftyp'),4)
  const mock = fake([Response.json({value:{video:'urn:li:video:asset',uploadToken:'',uploadInstructions:[{firstByte:0,lastByte:11,uploadUrl:'https://www.linkedin.com/dms-uploads/asset/video?token=test'}]}}),new Response(null,{status:200,headers:{etag:'part-id'}}),new Response(null,{status:200})])
  const result = await processPublication({...job,snapshot:{...snapshot,media:{path:`${UID}/video`,type:'video/mp4',size:12,name:'video.mp4'}}},connection,'secret',config,{...access,download:async()=>new Blob([bytes],{type:'video/mp4'})},async()=>{throw new Error('Must not publish yet')},mock.fetcher)
  equal(result,{outcome:'queued',container:'urn:li:video:asset'});equal(mock.calls.length,3)
  const finalized = JSON.parse(String(mock.calls[2].options.body));equal(finalized.finalizeUploadRequest.uploadedPartIds,['part-id'])
})
Deno.test('provider upload URL cannot leak tokens to an arbitrary host',async()=>{
  const mock = fake([Response.json({value:{image:'urn:li:image:asset',uploadUrl:'https://attacker.example/upload'}})])
  const result = await processPublication({...job,snapshot:{...snapshot,media:{path:`${UID}/photo`,type:'image/jpeg',size:3,name:'photo'}}},connection,'secret',config,{...access,download:async()=>new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'})},async()=>{},mock.fetcher)
  equal(result.outcome,'failed');equal(mock.calls.length,1)
})
Deno.test('real analytics keeps unavailable values null and requires LinkedIn permission',async()=>{
  const mock = fake([Response.json({like_count:0,comments_count:2})])
  equal(await readMetrics('instagram','123','token',[],config,mock.fetcher),{impressions:null,reactions:0,comments:2,shares:null})
  await rejects(()=>readMetrics('linkedin','urn:li:share:123','token',[],config,mock.fetcher));equal(mock.calls.length,1)
})
Deno.test('payment plans and hosted link use immutable server prices and suppress notifications',async()=>{
  const [plan] = readPlans(JSON.stringify([{id:'test',label:'Test only',amount:10000,credits:20}]))
  await rejects(()=>readPlans('[{"id":"test","label":"Test","amount":0,"credits":20}]'))
  const id='e7777777-7777-4777-8777-777777777777'
  const mock = fake([Response.json({id:'plink_Test123',short_url:'https://rzp.io/i/test',amount:10000,currency:'INR',reference_id:id,accept_partial:false})])
  const link = await createPaymentLink(id,plan,'rzp_test_Test123','secret-for-tests-only','https://app.example/?payment=returned',mock.fetcher)
  equal(link.id,'plink_Test123');const sent = JSON.parse(String(mock.calls[0].options.body))
  equal(sent.amount,10000);equal(sent.notify,{sms:false,email:false});equal(sent.accept_partial,false)
})
Deno.test('webhook signature is verified over original bytes and rejects tampering',async()=>{
  const secret='0123456789abcdef0123456789abcdef';const bytes = new TextEncoder().encode('{ "test": true }')
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const digest = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),b=>b.toString(16).padStart(2,'0')).join('')
  equal(await verifyWebhook(bytes,digest,secret),true)
  equal(await verifyWebhook(new TextEncoder().encode('{"test":true}'),digest,secret),false)
  equal(await verifyWebhook(bytes,'0'.repeat(64),secret),false)
})
Deno.test('only a full captured payment for the configured merchant is accepted',async()=>{
  const payload={account_id:'acc_test',event:'payment_link.paid',payload:{payment_link:{entity:{id:'plink_Test123',reference_id:'e7777777-7777-4777-8777-777777777777',status:'paid',accept_partial:false,currency:'INR',amount:10000,amount_paid:10000}},payment:{entity:{id:'pay_Test123',captured:true,status:'captured',amount:10000,currency:'INR',amount_refunded:0}}}}
  assert(paidEvent(payload,'acc_test'))
  await rejects(()=>paidEvent(payload,'acc_other'))
  payload.payload.payment.entity.captured=false;await rejects(()=>paidEvent(payload,'acc_test'))
  equal(paidEvent({event:'payment_link.partially_paid'},'acc_test'),null)
})
Deno.test('refund events only reconcile verified processed refunds; no refund is initiated',async()=>{
  const payload={account_id:'acc_test',event:'refund.processed',payload:{refund:{entity:{id:'rfnd_Test123',payment_id:'pay_Test123',status:'processed',amount:5000,currency:'INR'}}}}
  equal(refundedEvent(payload,'acc_test')?.refund_amount,5000)
  await rejects(()=>refundedEvent(payload,'acc_other'))
  payload.payload.refund.entity.status='failed';await rejects(()=>refundedEvent(payload,'acc_test'))
  equal(refundedEvent({event:'refund.created'},'acc_test'),null)
})
Deno.test('billing and publishing environment gates fail closed before database/provider calls',async()=>{
  const oldBilling=Deno.env.get('BILLING_ENABLED'),oldPublish=Deno.env.get('PUBLISHING_ENABLED')
  try {
    Deno.env.delete('BILLING_ENABLED');Deno.env.delete('PUBLISHING_ENABLED')
    let calls=0
    const client={rpc:()=>{calls++;return Promise.resolve({data:{billing:false,publishing:false},error:null})}} as unknown as SupabaseClient
    await rejects(()=>gate(client,'billing'));await rejects(()=>gate(client,'publishing'));equal(calls,0)
    Deno.env.set('BILLING_ENABLED','true');await rejects(()=>gate(client,'billing'));equal(calls,1)
  } finally {for(const [name,old] of [['BILLING_ENABLED',oldBilling],['PUBLISHING_ENABLED',oldPublish]]) {if(old === undefined)Deno.env.delete(name!);else Deno.env.set(name!,old)}}
})
Deno.test('CORS rejects unlisted sites and disallows non-POST methods',async()=>{
  const old=Deno.env.get('ALLOWED_ORIGINS');Deno.env.set('ALLOWED_ORIGINS','https://app.example')
  try {
    let calls=0;const handler=endpoint(async()=>{calls++;return json(200,{ok:true})})
    equal((await handler(new Request('https://edge.example',{method:'POST',headers:{origin:'https://evil.example'}}))).status,403)
    equal((await handler(new Request('https://edge.example',{method:'GET'}))).status,405)
    equal(calls,0)
  } finally {if(old === undefined)Deno.env.delete('ALLOWED_ORIGINS');else Deno.env.set('ALLOWED_ORIGINS',old)}
})
Deno.test('authenticated request additionally checks active session and cannot reuse globally signed-out JWT',async()=>{
  const oldURL=Deno.env.get('SUPABASE_URL'),oldKey=Deno.env.get('SUPABASE_ANON_KEY'),oldKeys=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),originalFetch=globalThis.fetch
  Deno.env.set('SUPABASE_URL','https://test.supabase.co');Deno.env.set('SUPABASE_ANON_KEY','public-test-key');Deno.env.delete('SUPABASE_PUBLISHABLE_KEYS')
  const seen:string[]=[]
  globalThis.fetch=async(input,options)=>{const url=String(input);seen.push(url);assert(new Headers(options?.headers).get('authorization') === 'Bearer revoked-token');return url.includes('/auth/v1/user') ? Response.json({id:UID}) : Response.json(false)}
  try {await rejects(()=>authenticate(new Request('https://edge.example',{headers:{authorization:'Bearer revoked-token'}})));equal(seen.length,2);assert(seen[1].endsWith('/rpc/has_active_session'))}
  finally {globalThis.fetch=originalFetch;for(const [name,old] of [['SUPABASE_URL',oldURL],['SUPABASE_ANON_KEY',oldKey],['SUPABASE_PUBLISHABLE_KEYS',oldKeys]]){if(old === undefined)Deno.env.delete(name!);else Deno.env.set(name!,old)}}
})
Deno.test('media signatures reject mislabeled HTML/SVG and allow expected container headers',()=>{
  equal(mediaSignatureMatches(new TextEncoder().encode('<svg onload="attack"/>'),'image/png'),false)
  equal(mediaSignatureMatches(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),true)
  equal(mediaSignatureMatches(new Uint8Array([26,69,223,163]),'audio/webm'),true)
})
