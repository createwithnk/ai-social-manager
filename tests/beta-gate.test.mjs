import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

for(const mode of ['allowed','denied','unavailable']) test(`Beta UI fails closed for ${mode} access and clears revoked access on focus`, async()=>{
  const states=[]; let cursor=0, effect, mounted=false, allowed=mode==='allowed'
  const listeners=new Map()
  const jsx=(type,props)=>({type,props})
  const {default:Gate}=loadModule('../src/BetaGate.tsx',{
    react:{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value}]},useEffect:fn=>{if(!mounted){effect=fn;mounted=true}}},
    'react/jsx-runtime':{jsx,jsxs:jsx}, './lib/locale':{useLocale:()=>({t:text=>text})},'./LanguageSwitcher':{},'./AdminDashboard':{},
    './lib/supabase':{supabase:{rpc:name=>{assert.equal(name,'beta_access');return {abortSignal:async()=>({data:allowed,error:mode==='unavailable'?{message:'secret'}:null})}}}},
  },'',{AbortController,window:{setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}})
  const render=()=>{cursor=0;return Gate({auth:{loading:false,signOut:async()=>{}},children:'protected-workspace'})}
  assert.equal(JSON.stringify(render()).includes('protected-workspace'),false)
  const cleanup=effect();await new Promise(resolve=>setImmediate(resolve))
  assert.equal(render()==='protected-workspace',mode==='allowed')
  assert.equal(JSON.stringify(render()).includes('secret'),false)
  if(mode==='allowed'){allowed=false;listeners.get('focus')();await new Promise(resolve=>setImmediate(resolve));assert.equal(render()==='protected-workspace',false)}
  cleanup();assert.equal(listeners.size,0)
})
