import test from 'node:test'
import assert from 'node:assert/strict'
import { readUsage } from '../supabase/functions/generate-content/monitoring.ts'
import { createHandler } from '../supabase/functions/generate-content/handler.ts'
import { loadModule } from './helpers.mjs'

test('usage measurement includes thinking tokens and rejects inconsistent or unsupported usage', () => {
  const usage = {promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:10,totalTokenCount:130}
  assert.deepEqual(readUsage({usageMetadata:usage}),{inputTokens:100,outputTokens:30})
  for(const metadata of [null,{}, {...usage,promptTokenCount:-1}, {...usage,totalTokenCount:131}, {...usage,thoughtsTokenCount:'10'}, {...usage,thoughtsTokenCount:null}, {...usage,cachedContentTokenCount:1}, {...usage,toolUsePromptTokenCount:1}]) assert.equal(readUsage({usageMetadata:metadata}),null)
})

for (const mode of ['success','missing_usage','invalid_response','provider_error','timeout','write_failed','budget_denied','budget_failed','bad_reservation','attachment']) test(`AI monitoring: ${mode}`, async () => {
  let providerCalls=0, quotaCalls=0; const outcomes=[]
  const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public',GEMINI_API_KEY:'private-sentinel'}
  const handler=createHandler({env:name=>env[name],authenticate:async()=> 'owner',consumeCredit:async()=>{quotaCalls++;return true},
    reserveAi:async()=>{if(mode==='budget_failed')throw new Error('secret');return mode==='budget_denied'?null:{id:mode==='bad_reservation'?'invalid':'11111111-1111-4111-8111-111111111111',maxOutputTokens:512}},
    finishAi:async(...args)=>{outcomes.push(args);if(mode==='write_failed')throw new Error('secret')},timeoutMs:10,
    fetch:async(_url,options)=>{
      providerCalls++
      const config=JSON.parse(options.body).generationConfig
      assert.equal(config.maxOutputTokens,512);assert.equal(config.thinkingConfig.thinkingBudget,0)
      if(mode==='timeout')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('secret'))))
      if(mode==='provider_error')return new Response('secret',{status:500})
      return Response.json({usageMetadata:mode==='missing_usage'?undefined:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:10,totalTokenCount:130},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(mode==='invalid_response'?{caption:''}:{caption:'Editable caption',hashtags:[]})}]}}]})
    }})
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer caller', 'Content-Type':'application/json'},body:JSON.stringify({idea:'UAE business content ideas',platform:'Instagram',tone:'Friendly',...(mode==='attachment'?{media:{path:'owner/file',type:'image/png'}}:{})})}))
  assert.equal(quotaCalls,0)
  assert.equal(providerCalls,['budget_denied','budget_failed','bad_reservation','attachment'].includes(mode)?0:1)
  assert.equal(response.status,['success','missing_usage','write_failed'].includes(mode)?200:mode==='budget_denied'?429:['budget_failed','bad_reservation'].includes(mode)?503:mode==='attachment'?400:502)
  const text=await response.text();assert.doesNotMatch(text,/secret|usageMetadata|inputTokens/)
  if(providerCalls){assert.equal(outcomes.length,1);assert.equal(outcomes[0][1],['success','missing_usage','write_failed'].includes(mode)?'success':mode);assert.deepEqual(outcomes[0][2],['missing_usage','provider_error','timeout'].includes(mode)?null:{inputTokens:100,outputTokens:30});assert.ok(outcomes[0][3]>=0)}
})

test('browser error reporting sends only allowlisted codes, bounds duplicates and tolerates failures', async () => {
  const calls=[]
  const {reportRuntimeError}=loadModule('../src/lib/monitoring.ts',{'./supabase':{supabase:{rpc:(name,payload)=>{calls.push({name,payload});return {abortSignal:async()=>{throw new Error('secret')}}}}}},'',{AbortSignal})
  await reportRuntimeError('render_failed');await reportRuntimeError('render_failed');await reportRuntimeError('private-sentinel')
  assert.equal(calls.length,1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{name:'report_runtime_error',payload:{error_code:'render_failed'}})
})
