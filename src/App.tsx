import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, LayoutDashboard, Menu, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { createDraft } from './lib/content'
import type { Platform, Post } from './types'

type View = 'dashboard'|'create'|'calendar'
const seed:Post[] = []
function loadPosts():Post[]{
  try{
    const saved=JSON.parse(localStorage.getItem('aasiflow-posts')||'[]')
    return Array.isArray(saved)?saved:seed
  }catch{return seed}
}

function App(){
  const [view,setView]=useState<View>('dashboard')
  const [posts,setPosts]=useState<Post[]>(loadPosts)
  const [editingPost,setEditingPost]=useState<Post|null>(null)
  const [composerKey,setComposerKey]=useState(0)
  const [mobile,setMobile]=useState(false)
  useEffect(()=>localStorage.setItem('aasiflow-posts',JSON.stringify(posts)),[posts])
  const drafts=posts.filter(p=>p.status==='draft').length
  const approved=posts.filter(p=>p.status==='approved').length
  const scheduled=posts.filter(p=>p.status==='scheduled').length
  function createPost(){setEditingPost(null);setComposerKey(v=>v+1);setView('create')}
  function editDraft(post:Post){setEditingPost(post);setView('create')}
  function savePost(post:Post){
    setPosts(items=>items.some(item=>item.id===post.id)?items.map(item=>item.id===post.id?post:item):[post,...items])
    if(post.status==='approved'){setEditingPost(null);setView('dashboard')}
  }
  return <div className="app-shell">
    <aside className={mobile?'sidebar open':'sidebar'}>
      <div className="brand"><div className="brand-mark"><WandSparkles size={20}/></div><div><strong>AasiFlowAI</strong><small>Content workspace</small></div></div>
      <button className="close" onClick={()=>setMobile(false)}><X/></button>
      <nav>
        <Nav active={view==='dashboard'} icon={<LayoutDashboard/>} label="Dashboard" onClick={()=>{setView('dashboard');setMobile(false)}}/>
        <Nav active={view==='create'} icon={<Sparkles/>} label="Create content" onClick={()=>{setView('create');setMobile(false)}}/>
        <Nav active={view==='calendar'} icon={<CalendarDays/>} label="Content calendar" onClick={()=>{setView('calendar');setMobile(false)}}/>
      </nav>
      <div className="guardrail"><CheckCircle2/><div><strong>Approval protected</strong><span>Nothing is published without your approval.</span></div></div>
    </aside>
    <main>
      <header><button className="menu" onClick={()=>setMobile(true)}><Menu/></button><div><small>AI SOCIAL MEDIA WORKSPACE</small><h1>{view==='dashboard'?'Welcome back, Noshad':view==='create'?'Create new content':'Content calendar'}</h1></div><button className="primary compact" onClick={createPost}><Plus/> New post</button></header>
      {view==='dashboard'&&<Dashboard posts={posts} drafts={drafts} approved={approved} scheduled={scheduled} onCreate={createPost} onEdit={editDraft}/>}
      {view==='create'&&<Generator key={editingPost?.id??`new-${composerKey}`} initialPost={editingPost} onSave={savePost}/>}
      {view==='calendar'&&<Calendar posts={posts} setPosts={setPosts}/>}
    </main>
    {mobile&&<div className="backdrop" onClick={()=>setMobile(false)}/>}
  </div>
}

function Nav({active,icon,label,onClick}:{active:boolean;icon:React.ReactNode;label:string;onClick:()=>void}){return <button className={active?'nav active':'nav'} onClick={onClick}>{icon}<span>{label}</span></button>}

function Dashboard({posts,drafts,approved,scheduled,onCreate,onEdit}:{posts:Post[];drafts:number;approved:number;scheduled:number;onCreate:()=>void;onEdit:(post:Post)=>void}){
  return <section className="content"><div className="hero"><div><span className="eyebrow">YOUR CONTENT COMMAND CENTER</span><h2>Turn one idea into<br/><em>platform-ready content.</em></h2><p>Draft with AI, review every word, and approve only when it feels right.</p><button className="primary" onClick={onCreate}><Sparkles/> Create with AI</button></div><div className="hero-orbit"><div className="orb"><WandSparkles/></div><span>IDEA</span><span>REVIEW</span><span>APPROVE</span></div></div>
    <div className="stats"><Stat icon={<BarChart3/>} value={posts.length} label="Total content"/><Stat icon={<FileText/>} value={drafts} label="Drafts"/><Stat icon={<CheckCircle2/>} value={approved} label="Approved"/><Stat icon={<Clock3/>} value={scheduled} label="Scheduled"/></div>
    <div className="panel"><div className="panel-head"><div><span className="eyebrow">WORKSPACE</span><h3>Recent content</h3></div><button className="ghost" onClick={onCreate}>Create new <Plus/></button></div>{posts.length===0?<div className="empty"><div><Sparkles/></div><h3>Your ideas start here</h3><p>Create your first post and keep full control before anything is scheduled.</p><button className="primary" onClick={onCreate}>Create first post</button></div>:<div className="post-list">{posts.slice(0,6).map(p=><article className="post" key={p.id}><div className="platform">{p.platform[0]}</div><div><strong>{p.idea}</strong><p>{p.caption.slice(0,100)}{p.caption.length>100?'…':''}</p></div>{p.status==='draft'?<button className="ghost" onClick={()=>onEdit(p)}>Continue draft</button>:<span className={`status ${p.status}`}>{p.status}</span>}</article>)}</div>}</div>
  </section>
}
function Stat({icon,value,label}:{icon:React.ReactNode;value:string|number;label:string}){return <div className="stat"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>}

function Generator({initialPost,onSave}:{initialPost:Post|null;onSave:(p:Post)=>void}){
  const [idea,setIdea]=useState(initialPost?.idea??'')
  const [platform,setPlatform]=useState<Platform>(initialPost?.platform??'Instagram')
  const [tone,setTone]=useState(initialPost?.tone??'Friendly')
  const [draft,setDraft]=useState<{caption:string;hashtags:string[]}|null>(initialPost?{caption:initialPost.caption,hashtags:initialPost.hashtags}:null)
  const [approved,setApproved]=useState(false)
  const [postId,setPostId]=useState<string|undefined>(initialPost?.id)
  const [createdAt,setCreatedAt]=useState<string|undefined>(initialPost?.createdAt)
  const canGenerate=idea.trim().length>=10
  function generate(){if(!canGenerate)return;setDraft(createDraft(idea,platform,tone));setApproved(false)}
  function save(status:'draft'|'approved'){
    if(!draft||(status==='approved'&&!approved))return
    const id=postId??crypto.randomUUID()
    const timestamp=createdAt??new Date().toISOString()
    setPostId(id)
    setCreatedAt(timestamp)
    onSave({id,idea:idea.trim(),platform,tone,...draft,status,createdAt:timestamp})
  }
  return <section className="content generator"><div className="steps"><span className={draft?'done':'current'}>1 <b>Brief</b></span><i/><span className={draft?'current':''}>2 <b>Review</b></span><i/><span>3 <b>Approve</b></span></div><div className="generator-grid"><div className="panel form-panel"><span className="eyebrow">STEP 1 — YOUR IDEA</span><h2>What do you want to share?</h2><label>Content idea<textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="Example: Five simple ways small businesses can create better Instagram posts..." maxLength={500}/><small>{idea.length}/500 · Minimum 10 characters</small></label><div className="field-row"><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value as Platform)}>{['Instagram','LinkedIn','Facebook','X'].map(x=><option key={x}>{x}</option>)}</select></label><label>Tone<select value={tone} onChange={e=>setTone(e.target.value)}>{['Friendly','Professional','Bold','Educational'].map(x=><option key={x}>{x}</option>)}</select></label></div><button className="primary wide" disabled={!canGenerate} onClick={generate}><WandSparkles/> Generate draft</button><p className="fineprint">This MVP uses a safe local draft engine. A server-side AI provider can be connected next without exposing API keys.</p></div>
    <div className="panel preview-panel"><span className="eyebrow">STEP 2 — REVIEW & EDIT</span><h2>Your draft</h2>{!draft?<div className="preview-empty"><Sparkles/><p>Your generated draft will appear here.</p></div>:<><label>Caption<textarea className="caption" value={draft.caption} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label><label>Hashtags<input value={draft.hashtags.map(t=>'#'+t).join(' ')} onChange={e=>setDraft({...draft,hashtags:e.target.value.split(/\s+/).map(t=>t.replace('#','')).filter(Boolean)})}/></label><button className="ghost draft-save" onClick={()=>save('draft')}><FileText/> {postId?'Update draft':'Save draft'}</button><div className="approval"><input id="approve" type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><label htmlFor="approve"><strong>I reviewed and approve this content</strong><span>Required before saving or scheduling.</span></label></div><button className="primary wide" disabled={!approved} onClick={()=>save('approved')}><CheckCircle2/> Approve & save</button></>}</div></div></section>
}

function Calendar({posts,setPosts}:{posts:Post[];setPosts:React.Dispatch<React.SetStateAction<Post[]>>}){
  const approved=useMemo(()=>posts.filter(p=>p.status==='approved'||p.status==='scheduled'),[posts])
  const [scheduleTimes,setScheduleTimes]=useState<Record<string,string>>({})
  const [defaultScheduleTime]=useState(()=>{
    const tomorrow=new Date()
    tomorrow.setDate(tomorrow.getDate()+1)
    tomorrow.setHours(10,0,0,0)
    return toDateTimeInput(tomorrow)
  })
  function schedule(id:string){
    const scheduledAt=new Date(scheduleTimes[id]??defaultScheduleTime)
    if(Number.isNaN(scheduledAt.getTime()))return
    setPosts(v=>v.map(p=>p.id===id?{...p,status:'scheduled',scheduledFor:scheduledAt.toISOString()}:p))
  }
  function unschedule(id:string){setPosts(v=>v.map(p=>p.id===id?{...p,status:'approved',scheduledFor:undefined}:p))}
  function scheduleTimeFor(post:Post){return scheduleTimes[post.id]??(post.scheduledFor?toDateTimeInput(new Date(post.scheduledFor)):defaultScheduleTime)}
  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">APPROVED CONTENT ONLY</span><h3>Ready to schedule</h3></div></div>{approved.length===0?<div className="empty"><CalendarDays/><h3>No approved content yet</h3><p>Review and approve a draft before it can appear here.</p></div>:<div className="post-list">{approved.map(p=><article className="post" key={p.id}><div className="platform">{p.platform[0]}</div><div><strong>{p.idea}</strong><p>{p.scheduledFor?`Scheduled for ${new Date(p.scheduledFor).toLocaleString()}`:'Approved and ready'}</p></div><div className="schedule-controls"><input aria-label={`Schedule ${p.idea}`} type="datetime-local" value={scheduleTimeFor(p)} onChange={e=>setScheduleTimes(times=>({...times,[p.id]:e.target.value}))}/><div><button className="ghost" onClick={()=>schedule(p.id)}><CalendarDays/> {p.status==='approved'?'Schedule':'Reschedule'}</button>{p.status==='scheduled'&&<button className="ghost unschedule" onClick={()=>unschedule(p.id)}>Unschedule</button>}</div></div></article>)}</div>}</div></section>
}

function toDateTimeInput(date:Date){
  const pad=(value:number)=>String(value).padStart(2,'0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export default App
