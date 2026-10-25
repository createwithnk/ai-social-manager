// Called by canva-bridge.test.mjs, so CI covers this file without a runner edit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCanvaCatalogHandler } from '../../supabase/functions/_shared/canva-catalog/service.ts'
import { encryptToken, decryptToken } from '../../supabase/functions/_shared/security.ts'
import { AssetError, type AssetGrant } from '../../supabase/functions/_shared/asset-bridge/protocol.ts'
import type { AssetConfig, AssetRuntime } from '../../supabase/functions/_shared/asset-bridge/service.ts'
globalThis.fetch = () => Promise.reject(new Error('Network is disabled in this synthetic fixture'))
const U='a1111111-1111-4111-8111-111111111111', S='a3333333-3333-4333-8333-333333333333', C='c5555555-5555-4555-8555-555555555555', G='d6666666-6666-4666-8666-666666666666', L='e7777777-7777-4777-8777-777777777777'
const now=1803340800000,owner={userId:U,sessionId:S},context=`velo-asset-grant:${C}:${U}:canva`
const config:AssetConfig={enabled:true,appUrl:'https://velo.example/',tokenKey:btoa('0123456789abcdef'.repeat(2)),clients:{canva:{clientId:'canva_fixture',clientSecret:'synthetic-client-secret'}}}
const grant:AssetGrant={accessToken:'fixture_old_access',refreshToken:'fixture_old_refresh',expiresAt:now+3600000,scopes:['design:meta:read'],accountId:'account_fixture',accountName:'Synthetic Canva'}
function req(body:unknown,origin='https://velo.example'){return new Request('https://nkfecpdegcmsapvbviky.supabase.co/functions/v1/velo-canva-catalog',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Authorization:'Bearer fixture'},body:JSON.stringify(body)})}
async function fixture(value=grant){
  const commands:{op:string,p:Record<string,unknown>}[]=[],requests:string[]=[]
  let identify=0,finish=true
  const encryptedGrant=await encryptToken(JSON.stringify(value),config.tokenKey,context)
  const runtime:AssetRuntime={config:()=>config,identify:async()=>{identify++;return owner},now:()=>now,command:async(op,who,p)=>{assert.deepEqual(who,owner);commands.push({op,p});if(op==='claim')return{id:C,generation:G,lease:L,encryptedGrant};if(op==='finish')return finish;throw new Error('Unexpected command')},fetcher:async(input,init)=>{requests.push(String(input));assert.equal(init?.method,'GET');return Response.json({items:[{id:'design_fixture',title:'Fixture',updated_at:now/1000,urls:{view_url:'https://private.invalid/?token=sentinel'}}]})}}
  return{runtime,commands,requests,get identify(){return identify},setFinish(value:boolean){finish=value}}
}
test('Canva closed module rejects before Auth, database or provider reads; wrong origin and forged owner fail',async()=>{
  const f=await fixture();const closed=createCanvaCatalogHandler(f.runtime)
  assert.equal((await closed(req({action:'list',kind:'design',query:''}))).status,423);assert.equal(f.identify,0);assert.equal(f.commands.length,0)
  const handler=createCanvaCatalogHandler(f.runtime,()=>true)
  assert.equal((await handler(req({action:'list',kind:'design',query:''},'https://wrong.invalid'))).status,403)
  assert.equal((await handler(req({action:'list',kind:'design',query:'',ownerId:U}))).status,400);assert.equal(f.identify,0)
})
test('Canva endpoint returns only bounded metadata after the same owner lease finishes',async()=>{
  const f=await fixture(),response=await createCanvaCatalogHandler(f.runtime,()=>true)(req({action:'list',kind:'design',query:''}))
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://velo.example')
  const body=await response.text();assert.equal(body.includes('fixture_old'),false);assert.equal(body.includes('sentinel'),false);assert.deepEqual(f.commands.map(item=>item.op),['claim','finish'])
  const saved=JSON.parse(await decryptToken(String(f.commands[1].p.encryptedGrant),config.tokenKey,context));assert.equal(saved.accessToken,grant.accessToken)
})
test('Canva template scope stays held without modifying the existing OAuth flow or calling a template endpoint',async()=>{
  const f=await fixture(),response=await createCanvaCatalogHandler(f.runtime,()=>true)(req({action:'list',kind:'brand-template',query:''}))
  assert.equal(response.status,409);assert.equal((await response.json()).error,'scope_required');assert.equal(f.requests.length,0);assert.deepEqual(f.commands.map(item=>item.op),['claim','finish'])
})
test('Canva refused or superseded lease never returns provider data',async()=>{
  const f=await fixture();f.setFinish(false)
  assert.equal((await createCanvaCatalogHandler(f.runtime,()=>true)(req({action:'list',kind:'design',query:''}))).status,409)
  const g=await fixture();g.runtime.command=async()=>null
  assert.notEqual((await createCanvaCatalogHandler(g.runtime,()=>true)(req({action:'list',kind:'design',query:''}))).status,200);assert.equal(g.requests.length,0)
})
test('Canva rotated refresh token is saved even if the subsequent metadata read fails; there is no refresh retry',async()=>{
  const f=await fixture({...grant,expiresAt:now-1000});let count=0
  f.runtime.fetcher=async(input,init)=>{
    count++
    if(count===1){assert.equal(String(input),'https://api.canva.com/rest/v1/oauth/token');assert.equal(init?.method,'POST');return Response.json({access_token:'fixture_new_access',refresh_token:'fixture_new_refresh',token_type:'Bearer',expires_in:3600})}
    if(count===2)return Response.json({active:true,client:config.clients.canva!.clientId,scope:'design:meta:read',exp:now/1000+1800,sub:grant.accountId})
    return new Response(null,{status:503})
  }
  const response=await createCanvaCatalogHandler(f.runtime,()=>true)(req({action:'list',kind:'design',query:''}));assert.equal(response.status,503);assert.equal(count,3)
  const saved=JSON.parse(await decryptToken(String(f.commands.at(-1)!.p.encryptedGrant),config.tokenKey,context));assert.equal(saved.refreshToken,'fixture_new_refresh')
})
test('Canva invalid encrypted credentials and revoked sessions make no provider request',async()=>{
  const f=await fixture();f.runtime.command=async(op,_owner,p)=>{f.commands.push({op,p});return op==='claim'?{id:C,generation:G,lease:L,encryptedGrant:'invalid'}:true}
  assert.equal((await createCanvaCatalogHandler(f.runtime,()=>true)(req({action:'list',kind:'design',query:''}))).status,409);assert.equal(f.commands.at(-1)?.p.failed,true);assert.equal(f.requests.length,0)
  const g=await fixture();g.runtime.identify=async()=>{throw new AssetError('request_rejected',401)}
  assert.equal((await createCanvaCatalogHandler(g.runtime,()=>true)(req({action:'list',kind:'design',query:''}))).status,401);assert.equal(g.commands.length,0)
})
test('Canva server rejects unsupported methods and preflight is inert',async()=>{
  const f=await fixture(),handler=createCanvaCatalogHandler(f.runtime,()=>true)
  assert.equal((await handler(new Request('https://velo.example/',{method:'OPTIONS',headers:{Origin:'https://velo.example'}}))).status,204)
  assert.equal((await handler(new Request('https://velo.example/'))).status,405);assert.equal(f.identify,0);assert.equal(f.commands.length,0)
})
