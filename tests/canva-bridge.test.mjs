import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { CanvaBridgeError, linkedReference, pageResult, queryInput, referenceUrl } from '../supabase/functions/_shared/canva-catalog/contracts.ts'
import { readCanvaCatalog } from '../supabase/functions/_shared/canva-catalog/transport.ts'
import { bounded, createCanvaCatalog } from '../src/features/canva-bridge/catalog.ts'
import { mappingState, postFingerprint, readWorkspace, removeMapping, saveMapping, saveReference, workspaceKey } from '../src/features/canva-bridge/mappings.ts'
import { canvaError, canvaLabels } from '../src/features/canva-bridge/labels.ts'

const U='a1111111-1111-4111-8111-111111111111', B='b2222222-2222-4222-8222-222222222222'
const asset={kind:'design',id:'design_fixture',title:'Product poster',updatedAt:1803340800,origin:'account'}
const post={id:'post_fixture',idea:'Product launch',platform:'Instagram',tone:'Friendly',caption:'Fixture caption',hashtags:['fixture'],status:'scheduled',createdAt:'2026-10-24T00:00:00Z',scheduledFor:'2027-01-01T09:00:00Z',revision:4,language:'ar',market:'UAE'}
const signal=()=>new AbortController().signal
function memory(){const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}}
const rejects=(fn,code)=>assert.rejects(fn,error=>error instanceof CanvaBridgeError&&error.code===code)
const raw=(id=asset.id)=>({id,title:asset.title,updated_at:asset.updatedAt,urls:{view_url:'https://private.invalid/signed?token=sentinel'},thumbnail:{url:'https://private.invalid/signed'},owner:{user_id:'private_owner'}})
const nofetch=()=>{throw new Error('Unexpected provider request')}

test('Canva links reject credentials and alternate origins and store only clean IDs, never link capabilities',()=>{
  const linked=linkedReference('Product','https://www.canva.com/design/design_fixture/share_fixture/edit?utm_source=test')
  assert.equal(referenceUrl(linked),'https://www.canva.com/design/design_fixture/view')
  assert.equal(linked.origin,'link');assert.equal(linked.updatedAt,null)
  assert.equal(linkedReference('Brand','https://www.canva.com/brand/brand-templates/template_fixture').kind,'brand-template')
  for(const url of ['https://www.canva.com.evil.invalid/design/design_fixture/view','https://user:pass@www.canva.com/design/design_fixture/view','http://canva.com/design/design_fixture/view','https://canva.com/design/design_fixture/view?token=secret','https://canva.com/design/design_fixture/view#secret','https://canva.com/templates/search/','https://canva.com/design/design_fixture/view?redirect_uri=https://evil.invalid']) assert.throws(()=>linkedReference('Name',url),CanvaBridgeError)
  assert.throws(()=>linkedReference('\u202esecret','https://www.canva.com/design/design_fixture/view'),CanvaBridgeError)
})
test('Canva catalog contracts reject duplicate, oversized, cross-kind or unverified account items',()=>{
  assert.deepEqual(pageResult({items:[asset],continuation:null},'design'),{items:[asset],continuation:null})
  for(const value of [{items:[asset,asset],continuation:null},{items:[{...asset,origin:'link'}],continuation:null},{items:Array(101).fill(asset),continuation:null},{items:[asset],continuation:'\nunsafe'}]) assert.throws(()=>pageResult(value,'design'),CanvaBridgeError)
  assert.throws(()=>pageResult({items:[asset],continuation:null},'brand-template'),CanvaBridgeError)
  for(const value of [{kind:'unknown',query:''},{kind:'design',query:'x'.repeat(121)},{kind:'design',query:'',continuation:'x\r\n'}]) assert.throws(()=>queryInput(value),CanvaBridgeError)
})
test('Canva server transport only builds fixed GET endpoints and drops private response URLs and owners',async()=>{
  let calls=0
  const result=await readCanvaCatalog({action:'list',input:{kind:'design',query:'Arabic offer',continuation:'opaque+/='}},'fixture_access',['design:meta:read'],async(input,init)=>{
    calls++;const url=new URL(input);assert.equal(url.origin,'https://api.canva.com');assert.equal(url.pathname,'/rest/v1/designs');assert.equal(url.searchParams.get('query'),'Arabic offer');assert.equal(url.searchParams.get('continuation'),'opaque+/=');assert.equal(url.searchParams.has('limit'),false)
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer fixture_access')
    return Response.json({items:[raw()],continuation:'next_fixture'})
  })
  assert.equal(calls,1);assert.equal(result.items[0].id,asset.id);assert.equal(JSON.stringify(result).includes('sentinel'),false);assert.equal(JSON.stringify(result).includes('private_owner'),false)
  await rejects(()=>readCanvaCatalog({action:'get',kind:'design',id:'../escape'},'fixture',['design:meta:read'],nofetch),'invalid')
})
test('Canva Brand Templates fail without explicit scope before network and support the documented envelope when scoped',async()=>{
  await rejects(()=>readCanvaCatalog({action:'list',input:{kind:'brand-template',query:''}},'fixture',['design:meta:read'],nofetch),'scope_required')
  const result=await readCanvaCatalog({action:'get',kind:'brand-template',id:'template_fixture'},'fixture',['brandtemplate:meta:read'],async input=>{assert.equal(String(input),'https://api.canva.com/rest/v1/brand-templates/template_fixture');return Response.json({brand_template:raw('template_fixture')})})
  assert.equal(result.kind,'brand-template');assert.equal(result.origin,'account')
})
test('Canva metadata rejects wrong identity, duplicate pages, redirects, unsupported body types and bounded size',async()=>{
  const get={action:'get',kind:'design',id:asset.id},list={action:'list',input:{kind:'design',query:''}}
  await rejects(()=>readCanvaCatalog(get,'fixture',['design:meta:read'],async()=>Response.json({design:raw('other_fixture')})),'unavailable')
  await assert.rejects(()=>readCanvaCatalog(list,'fixture',['design:meta:read'],async()=>Response.json({items:[raw(),raw()]})),CanvaBridgeError)
  for(const response of [new Response(null,{status:302,headers:{location:'https://evil.invalid'}}),new Response('{}',{headers:{'Content-Type':'text/html'}}),Response.json({padding:'x'.repeat(262145)})]) await rejects(()=>readCanvaCatalog(list,'fixture',['design:meta:read'],async()=>response),'unavailable')
  await rejects(()=>readCanvaCatalog(get,'fixture',['design:meta:read'],async()=>new Response(null,{status:403})),'connection_required')
})
test('Canva GET deadline covers both missing headers and stalled streamed bytes with no automatic retry',async()=>{
  const request={action:'list',input:{kind:'design',query:''}}
  let calls=0
  await rejects(()=>readCanvaCatalog(request,'fixture',['design:meta:read'],()=>{calls++;return new Promise(()=>{})},5),'unavailable');assert.equal(calls,1)
  await rejects(()=>readCanvaCatalog(request,'fixture',['design:meta:read'],async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'))}}),{headers:{'Content-Type':'application/json'}}),5),'unavailable')
})
test('Canva catalog client is inert until invoked and accepts only same-ID verified metadata',async()=>{
  const requests=[]
  const client=createCanvaCatalog(async body=>{requests.push(body);return body.action==='list'?{page:{items:[asset],continuation:null}}:{item:{...asset,id:'other_fixture'}}},async()=>{throw new Error('not called')})
  assert.equal(requests.length,0)
  await client.list({kind:'design',query:' Offer '},signal());assert.deepEqual(requests,[{action:'list',kind:'design',query:'Offer'}])
  await rejects(()=>client.get(asset,signal()),'invalid')
})
test('Canva caller deadline ignores late results and cancellation prevents a pending UI action',async()=>{
  const control=new AbortController();let received
  const pending=bounded(control.signal,inner=>{received=inner;return new Promise(()=>{})},100)
  control.abort();await rejects(()=>pending,'cancelled');assert.equal(received.aborted,true)
  await rejects(()=>bounded(signal(),()=>new Promise(()=>{}),5),'unavailable')
})
test('Canva references and mappings persist only under new owner keys and preserve all existing post records',async()=>{
  const store=memory();store.setItem('aasiflow-posts','preserved');store.setItem('velo:asset-links:v1:'+U,'older-library')
  const before=structuredClone(post);let data=readWorkspace(store,U)
  data=saveReference(store,U,data,asset)
  data=await saveMapping(store,U,data,asset,post.id,await postFingerprint(post),()=>[post],new Date('2026-10-24T00:00:00Z'))
  assert.equal(data.value.mappings.length,1);assert.equal(await mappingState(data.value.mappings[0],[post]),'current')
  assert.deepEqual(post,before);assert.equal(store.getItem('aasiflow-posts'),'preserved');assert.equal(store.getItem('velo:asset-links:v1:'+U),'older-library');assert.equal(readWorkspace(store,B).value.mappings.length,0)
  assert.equal(JSON.stringify(data.value).includes('caption'),false)
  assert.equal(removeMapping(store,U,data,post.id).value.mappings.length,0)
})
test('Canva mapping detects content, media, schedule, revision and lifecycle changes instead of silently treating links as approved',async()=>{
  const store=memory();const data=await saveMapping(store,U,readWorkspace(store,U),asset,post.id,await postFingerprint(post),()=>[post]);const item=data.value.mappings[0]
  for(const delta of [{caption:'Changed'},{scheduledFor:'2027-02-01T00:00:00Z'},{revision:5},{status:'draft'},{hashtags:['new']},{language:'en'},{media:{path:U+'/new',name:'New',type:'image/png',size:9}}]) assert.equal(await mappingState(item,[{...post,...delta}]),'changed')
  assert.equal(await mappingState(item,[]),'missing')
  await rejects(async()=>saveMapping(store,U,data,asset,post.id,await postFingerprint(post),()=>[{...post,status:'draft'}]),'post_changed')
})
test('Canva mapping rejects a post changed during async hashing without any new write',async()=>{
  const store=memory(),data=readWorkspace(store,U),fingerprint=await postFingerprint(post);let reads=0
  await rejects(()=>saveMapping(store,U,data,asset,post.id,fingerprint,()=>++reads===1?[post]:[{...post,revision:5}]),'post_changed')
  assert.equal(store.getItem(workspaceKey(U)),null)
})
test('Canva storage fails closed on corrupt, cross-owner and conflicting records without a destructive reset',()=>{
  const store=memory(),data=readWorkspace(store,U)
  store.setItem(workspaceKey(U),'corrupt-fixture');assert.throws(()=>readWorkspace(store,U),CanvaBridgeError);assert.throws(()=>saveReference(store,U,data,asset),error=>error.code==='conflict');assert.equal(store.getItem(workspaceKey(U)),'corrupt-fixture')
  store.setItem(workspaceKey(U),JSON.stringify({...data.value,ownerId:B}));assert.throws(()=>readWorkspace(store,U),CanvaBridgeError)
  assert.throws(()=>readWorkspace(store,'local-preview'),error=>error.code==='sign_in')
})
test('Canva browser quota failure and stale tab writes leave prior valid records intact',()=>{
  const store=memory(),empty=readWorkspace(store,U),saved=saveReference(store,U,empty,asset)
  assert.throws(()=>saveReference(store,U,empty,{...asset,id:'new_fixture'}),error=>error.code==='conflict')
  const failing={getItem:key=>store.getItem(key),setItem(){throw new Error('Quota exceeded')}}
  assert.throws(()=>saveReference(failing,U,saved,{...asset,id:'new_fixture'}),error=>error.code==='storage');assert.equal(readWorkspace(store,U).value.references.length,1)
})
test('Canva module has separate English/Arabic strings for every surfaced error',()=>{
  const en=canvaLabels('en'),ar=canvaLabels('ar');assert.deepEqual(Object.keys(en).sort(),Object.keys(ar).sort())
  for(const code of ['setup_pending','sign_in','connection_required','scope_required','invalid','unavailable','cancelled','storage','conflict','post_changed','asset_changed']){assert.ok(canvaError('en',code));assert.ok(/[\u0600-\u06ff]/u.test(canvaError('ar',code)))}
})
test('Canva grant/handler synthetic security cases run in a child with TypeScript transforms and no network',()=>{
  const result=spawnSync(process.execPath,['--experimental-transform-types','--test','tests/fixtures/canva-catalog-server.ts'],{cwd:process.cwd(),encoding:'utf8',timeout:30000,env:{...process.env,NODE_NO_WARNINGS:'1'}})
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
})
