import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaSignatureMatches } from '../supabase/functions/_shared/media-signature.ts'
import { loadModule } from './helpers.mjs'

test('Edge adapter requires a verified nonanonymous user and uses the caller session for existing quota and revoked-session RPCs', async () => {
  for (const user of [null, { id: 'id', is_anonymous: true, email_confirmed_at: '2026-01-01' }, { id: 'id', is_anonymous: false }, { id: 'verified-id', is_anonymous: false, email_confirmed_at: '2026-01-01' }]) {
    let dependencies
    const calls = []
    const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'fake-public-key' }
    loadModule('../supabase/functions/generate-content/index.ts', {
      'npm:@supabase/supabase-js@2.112.4': { createClient: (_url, key) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, payload) => { calls.push({ name, payload, key }); return { data: true, error: null } } }) },
      '../_shared/media-signature.ts': { mediaSignatureMatches },
      './handler.ts': { createHandler: (value) => { dependencies = value; return () => {} } },
    }, '', { Deno: { env: { get: (name) => env[name] }, serve: () => {} }, fetch, AbortSignal })
    assert.equal(await dependencies.authenticate(env.SUPABASE_URL, 'fake-public-key', 'fake-user-token'), user?.id === 'verified-id' ? 'verified-id' : null)
    if (user?.id === 'verified-id') {
      assert.equal(await dependencies.consumeCredit(user.id, 'fake-user-token'), true)
      assert.equal(calls[0].name, 'has_active_session')
      assert.equal(calls[1].name, 'consume_ai_quota')
      assert.equal(calls[1].key, 'fake-public-key')
      assert.equal(calls[1].payload, undefined)
    }
  }
})

test('revoked sessions and session-security failures stop the AI adapter', async () => {
  for (const failure of [false, true]) {
    let dependencies
    loadModule('../supabase/functions/generate-content/index.ts', {
      'npm:@supabase/supabase-js@2.112.4': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'verified-id', email_confirmed_at: '2026-01-01' } }, error: null }) }, rpc: async () => ({ data: false, error: failure ? new Error('mock-unavailable') : null }) }) },
      '../_shared/media-signature.ts': { mediaSignatureMatches },
      './handler.ts': { createHandler: value => { dependencies = value; return () => {} } },
    }, '', { Deno: { env: { get: () => '' }, serve: () => {} }, fetch, AbortSignal })
    if (failure) await assert.rejects(dependencies.authenticate('https://example.invalid','public-key','mock-token'))
    else assert.equal(await dependencies.authenticate('https://example.invalid','public-key','mock-token'), null)
  }
})

test('runtime reserves with caller credentials and writes only fixed usage fields with server credentials', async () => {
  let dependencies
  const calls=[]
  const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'server-only-key'}
  loadModule('../supabase/functions/generate-content/index.ts', {
    'npm:@supabase/supabase-js@2.112.4': {createClient:(_url,key,options)=>({rpc:async(name,payload)=>{
      calls.push({key,name,payload,authorization:options.global.headers?.Authorization})
      return {data:name==='reserve_ai_request'?{id:'11111111-1111-4111-8111-111111111111',maxOutputTokens:512}:true,error:null}
    }})}, '../_shared/media-signature.ts':{mediaSignatureMatches},
    './handler.ts':{createHandler:value=>{dependencies=value;return ()=>{}}},
  },'',{Deno:{env:{get:name=>env[name]},serve:()=>{}},fetch,AbortSignal})
  const reservation=await dependencies.reserveAi('gemini-2.5-flash','caller-token')
  await dependencies.finishAi(reservation.id,'success',{inputTokens:10,outputTokens:20},500)
  assert.equal(calls[0].name,'reserve_ai_request');assert.equal(calls[0].key,'public-key');assert.equal(calls[0].authorization,'Bearer caller-token')
  assert.equal(calls[1].name,'finish_ai_request');assert.equal(calls[1].key,'server-only-key');assert.equal(calls[1].authorization,undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].payload)),{request_id:reservation.id,result_code:'success',prompt_tokens:10,completion_tokens:20,duration_ms:500})
  delete env.SUPABASE_SERVICE_ROLE_KEY
  await assert.rejects(dependencies.reserveAi('gemini-2.5-flash','caller-token'))
  assert.equal(calls.length,2)
})
