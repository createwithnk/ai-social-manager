const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const security={};vm.runInNewContext(compile('supabase/functions/_shared/security.ts'),{exports:security,TextEncoder,TextDecoder,Uint8Array,URL});
let fetched=[];
const retention={};vm.runInNewContext(compile('supabase/functions/_shared/retention.ts'),{exports:retention,RequestError:security.RequestError,secureURL:security.secureURL,Request,AbortSignal,URL,fetch:async(input,options)=>{fetched.push({input,options});return new Response('{}')}});
const owner='a1111111-1111-4111-8111-111111111111';
const good={id:'c1111111-1111-4111-8111-111111111111',object_id:'d1111111-1111-4111-8111-111111111111',owner_id:owner,lease_id:'e1111111-1111-4111-8111-111111111111',bucket_id:'post-media',name:`${owner}/isolated.png`};
let handler,calls,removals,clients,claim,dbGate,allowBegin,allowFinish,removeResult,removeThrows,finishThrows,closeAfterClaim;
const env={SUPABASE_URL:'https://retention-fixture.supabase.co',MEDIA_RETENTION_ENABLED:'true',MEDIA_RETENTION_SECRET:'a'.repeat(64)};
const admin={storage:{from:bucket=>{assert.equal(bucket,'post-media');return {remove:async paths=>{removals.push(paths);if(removeThrows)throw new Error('Private transport detail');return removeResult}}}}};
vm.runInNewContext(compile('supabase/functions/media-retention/index.ts'),{
  Deno:{serve:fn=>{handler=fn}},env:name=>env[name],json:(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}),
  rpc:async(_client,name,args)=>{calls.push({name,args});if(name==='service_media_retention_enabled')return dbGate;if(name==='service_claim_media_delete'){if(closeAfterClaim)env.MEDIA_RETENTION_ENABLED='false';return claim}if(name==='service_begin_media_delete')return allowBegin;if(name==='service_finish_media_delete'){if(finishThrows)throw new Error('Private RPC detail');return allowFinish}throw new Error('Unexpected RPC')},
  serviceClient:fetcher=>{assert.equal(typeof fetcher,'function');clients++;return admin},
  constantTimeEqual:security.constantTimeEqual,RequestError:security.RequestError,
  mediaDeleteClaim:retention.mediaDeleteClaim,retentionFetch:retention.retentionFetch,
});
const request=(headers={},method='POST')=>new Request('https://edge.example/media-retention',{method,headers:{authorization:`Bearer ${env.MEDIA_RETENTION_SECRET}`,...headers}});
function reset(){calls=[];removals=[];clients=0;claim={...good};dbGate=true;allowBegin=true;allowFinish=true;removeResult={data:[{id:good.object_id,name:good.name}],error:null};removeThrows=false;finishThrows=false;closeAfterClaim=false;env.MEDIA_RETENTION_ENABLED='true';env.MEDIA_RETENTION_SECRET='a'.repeat(64);env.SUPABASE_URL='https://retention-fixture.supabase.co'}
test('retention actual entrypoint is service-authenticated, gated, single-dispatch and fails closed on ambiguity',async t=>{
  const check=(name,fn)=>t.test(name,async()=>{reset();await fn()});
  await check('GET cannot start a worker',async()=>{assert.equal((await handler(request({},'GET'))).status,405);assert.equal(clients,0)});
  await check('browser origins cannot access the server worker',async()=>{assert.equal((await handler(request({origin:'https://app.example'}))).status,403);assert.equal(clients,0)});
  await check('missing/invalid worker secret makes no server request',async()=>{env.MEDIA_RETENTION_SECRET='';assert.equal((await handler(request())).status,401);assert.equal(clients,0)});
  await check('wrong authentication makes no server request',async()=>{assert.equal((await handler(request({authorization:'Bearer wrong'}))).status,401);assert.equal(clients,0)});
  await check('closed environment gate stops before any RPC',async()=>{env.MEDIA_RETENTION_ENABLED='false';assert.equal((await handler(request())).status,423);assert.equal(clients,0);assert.equal(calls.length,0)});
  await check('closed database gate cannot claim or delete',async()=>{dbGate=false;assert.equal((await handler(request())).status,423);assert.equal(calls.length,1);assert.equal(removals.length,0)});
  await check('empty due queue returns idle with no Storage request',async()=>{claim=null;assert.deepEqual(await (await handler(request())).json(),{processed:false});assert.equal(removals.length,0)});
  for(const [name,value] of [['wrong bucket',{...good,bucket_id:'public'}],['foreign owner',{...good,name:'b2222222-2222-4222-8222-222222222222/file'}],['path traversal',{...good,name:`${owner}/../private`}],['invalid lease',{...good,lease_id:'not-a-lease'}]]){
    await check(`malformed claim (${name}) cannot select a deletion path`,async()=>{claim=value;assert.equal((await handler(request())).status,503);assert.equal(removals.length,0);assert.equal(calls.some(call=>call.name==='service_begin_media_delete'),false)});
  }
  await check('identity/lease rejection stops before Storage',async()=>{allowBegin=false;assert.equal((await handler(request())).status,409);assert.equal(removals.length,0)});
  await check('environment gate is checked again after claiming',async()=>{closeAfterClaim=true;assert.equal((await handler(request())).status,409);assert.equal(removals.length,0);assert.equal(calls.some(call=>call.name==='service_begin_media_delete'),false)});
  await check('one approved exact object removal is finalized with the same lease',async()=>{
    const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:true,id:good.id,status:'deleted'});
    assert.deepEqual(JSON.parse(JSON.stringify(removals)),[[good.name]]);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{name:'service_finish_media_delete',args:{qid:good.id,lease:good.lease_id,deleted:true}});assert.equal(response.headers.get('cache-control'),'no-store');
  });
  for(const [name,result] of [['Storage error',{data:null,error:{message:'Private Storage error'}}],['empty result',{data:[],error:null}],['wrong object ID',{data:[{id:'replacement',name:good.name}],error:null}],['wrong path',{data:[{id:good.object_id,name:'wrong'}],error:null}],['multiple objects',{data:[{id:good.object_id,name:good.name},{id:'other',name:'other'}],error:null}]]){
    await check(`${name} is uncertain without retry`,async()=>{removeResult=result;const response=await handler(request());assert.equal(response.status,503);assert.equal(removals.length,1);assert.equal(calls.at(-1).args.deleted,false);assert.equal((await response.text()).includes('Private'),false)});
  }
  await check('transport timeout records uncertainty, never retries or leaks details',async()=>{removeThrows=true;const response=await handler(request());assert.equal(response.status,503);assert.equal(removals.length,1);assert.equal(calls.at(-1).args.deleted,false);assert.equal((await response.text()).includes('Private'),false)});
  await check('lost lease/unconfirmed database result is not reported as deleted',async()=>{allowFinish=false;assert.equal((await handler(request())).status,503);assert.equal(removals.length,1)});
  await check('database error after Storage deletion makes no second deletion',async()=>{finishThrows=true;const response=await handler(request());assert.equal(response.status,500);assert.equal(removals.length,1);assert.equal((await response.text()).includes('Private'),false)});
  await check('unsafe Supabase root cannot create a client',async()=>{env.SUPABASE_URL='https://retention-fixture.supabase.co/path';assert.equal((await handler(request())).status,503);assert.equal(clients,0)});
});
test('retention HTTP stays on the approved HTTPS origin with redirect rejection and timeout',async()=>{
  fetched=[];const bounded=retention.retentionFetch('https://retention-fixture.supabase.co');
  await bounded('https://retention-fixture.supabase.co/storage/v1/object/post-media',{method:'DELETE'});
  assert.equal(fetched.length,1);assert.equal(fetched[0].options.redirect,'error');assert(fetched[0].options.signal instanceof AbortSignal);
  assert.throws(()=>bounded('https://evil.example/storage'));assert.throws(()=>bounded('http://retention-fixture.supabase.co/storage'));assert.throws(()=>bounded('https://user:password@retention-fixture.supabase.co/storage'));
  assert.equal(fetched.length,1,'Rejected destinations are never fetched');
});
