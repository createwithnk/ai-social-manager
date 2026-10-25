// Synthetic host only; never imported by the real app or included in its bundle.
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Post } from '../../src/types'
import CanvaCreativeBridge from '../../src/features/canva-bridge/CanvaCreativeBridge'
import type { CanvaCatalog, CanvaReference } from '../../src/features/canva-bridge/types'
import { CanvaBridgeError } from '../../supabase/functions/_shared/canva-catalog/contracts'
const A='a1111111-1111-4111-8111-111111111111',B='b2222222-2222-4222-8222-222222222222'
const item:CanvaReference={id:'design_fixture',kind:'design',title:'عرض متجر تجريبي',updatedAt:1803340800,origin:'account'}
function syntheticRecovery(){
  let ready=false;const values=new Map<string,string>()
  return{unblock:()=>{ready=true},storage:{getItem:(key:string)=>{if(!ready)throw new Error('Synthetic storage is temporarily blocked');return values.get(key)??null},setItem:(key:string,value:string)=>{if(!ready)throw new Error('Synthetic storage is temporarily blocked');values.set(key,value)}}}
}
export default function Harness(){
  const [owner,setOwner]=useState(A),[shown,setShown]=useState(true),[revision,setRevision]=useState(1),[draft,setDraft]=useState(false)
  const mode=new URLSearchParams(location.search).get('mode'),locale=new URLSearchParams(location.search).get('lang')==='ar'?'ar':'en'
  const posts=useMemo<readonly Post[]>(()=>[{id:'post_fixture',idea:'Product launch',caption:'Fixture content',hashtags:[],platform:'Instagram',tone:'Friendly',status:draft?'draft':'scheduled',createdAt:'2026-10-24T00:00:00Z',scheduledFor:draft?undefined:'2027-01-01T09:00:00Z',revision}], [revision,draft])
  const catalog=useMemo<CanvaCatalog>(()=>({
    id:'synthetic-canva',connect:async()=>{throw new CanvaBridgeError('setup_pending')},
    list:async input=>{
      document.body.dataset.reads=String(Number(document.body.dataset.reads??'0')+1)
      if(input.kind==='brand-template')throw new CanvaBridgeError('scope_required')
      return{items:[input.continuation?{...item,id:'second_fixture',title:'Second creative'}:item],continuation:input.continuation?null:'next_fixture'}
    },
    get:async selected=>{
      document.body.dataset.verifications=String(Number(document.body.dataset.verifications??'0')+1)
      if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,250))
      if(mode==='unavailable')throw new Error('private-provider-sentinel')
      return{...selected,updatedAt:mode==='changed'?1803340810:selected.updatedAt}
    },
  }),[mode])
  const [recovery]=useState(syntheticRecovery)
  return <main style={{fontFamily:'sans-serif',padding:12}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <button onClick={()=>setOwner(owner===A?B:A)}>Switch test owner</button><button onClick={()=>setShown(value=>!value)}>Toggle panel</button>
      <button onClick={()=>setRevision(value=>value+1)}>Change post revision</button><button onClick={()=>setDraft(true)}>Make post draft</button>
      {mode==='recover-storage'&&<button onClick={recovery.unblock}>Unblock synthetic storage</button>}
    </div>
    {shown&&<CanvaCreativeBridge ownerId={owner} posts={posts} enabled={mode!=='disabled'} locale={locale} catalog={mode==='default-paused'?undefined:catalog} storage={mode==='recover-storage'?recovery.storage:undefined}/>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Harness/> )
