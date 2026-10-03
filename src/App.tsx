import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { useAuth, type AuthState } from './lib/auth'
import { generateDraft } from './lib/content'
import { fetchPosts, savePostForUser } from './lib/posts'
import { isSupabaseConfigured } from './lib/supabase'
import { uploadMedia, mediaPreview } from './lib/media'
import type { Platform, Post, PostMedia } from './types'

type View = 'dashboard' | 'create' | 'calendar' | 'detail'

function loadLocalPosts(): Post[] {
  try {
    const saved = JSON.parse(localStorage.getItem('aasiflow-posts') || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.'
}

function replacePost(posts: Post[], post: Post) {
  return posts.some((item) => item.id === post.id)
    ? posts.map((item) => item.id === post.id ? post : item)
    : [post, ...posts]
}

function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <AuthLoading />
  if (auth.status === 'error') return <AuthBootstrapError auth={auth} />
  if (isSupabaseConfigured && !auth.user) return <AuthScreen auth={auth} />

  return <Workspace auth={auth} />
}

function AuthLoading() {
  return <main className="auth-shell"><section className="auth-card"><LoaderCircle className="spinner" /><h1>Loading AasiFlowAI</h1><p>Checking your session securely.</p></section></main>
}

function AuthBootstrapError({ auth }: { auth: AuthState }) {
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-error-title"><span className="eyebrow">CONNECTION ISSUE</span><h1 id="auth-error-title">We couldn’t start your secure session</h1><p>{auth.error ?? 'Check your connection and Supabase configuration, then retry.'}</p><button className="primary wide" type="button" onClick={auth.retrySession}>Retry session check</button></section></main>
}

function AuthScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    const result = mode === 'login'
      ? await auth.signIn(email, password)
      : await auth.signUp(email, password)
    setNotice(result.notice ?? null)
  }

  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title"><div className="brand auth-brand"><div className="brand-mark"><WandSparkles size={20} /></div><div><strong>AasiFlowAI</strong><small>Content workspace</small></div></div><span className="eyebrow">SECURE WORKSPACE</span><h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p>{mode === 'login' ? 'Sign in to access your content workspace.' : 'Use your email to create a protected workspace.'}</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={auth.loading} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required disabled={auth.loading} /></label>{auth.error && <p className="form-error" role="alert">{auth.error}</p>}{notice && <p className="form-notice" role="status">{notice}</p>}<button className="primary wide" disabled={auth.loading}>{auth.loading ? <><LoaderCircle className="spinner" /> Please wait</> : mode === 'login' ? 'Log in' : 'Sign up'}</button></form><button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setNotice(null) }} disabled={auth.loading}>{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}</button></section></main>
}

function Workspace({ auth }: { auth: AuthState }) {
  const [view, setView] = useState<View>('dashboard')
  const [posts, setPosts] = useState<Post[]>(() => isSupabaseConfigured ? [] : loadLocalPosts())
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [viewingPost, setViewingPost] = useState<Post | null>(null)
  const [detailBackView, setDetailBackView] = useState<'dashboard' | 'calendar'>('dashboard')
  const [composerKey, setComposerKey] = useState(0)
  const [mobile, setMobile] = useState(false)
  const [postsLoading, setPostsLoading] = useState(isSupabaseConfigured)
  const [postsError, setPostsError] = useState<string | null>(null)
  const userId = auth.user?.id

  useEffect(() => {
    if (isSupabaseConfigured) return
    try {
      localStorage.setItem('aasiflow-posts', JSON.stringify(posts))
    } catch {
      // Local storage is an optional fallback; keep the current session usable if it is unavailable.
    }
  }, [posts])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return

    let active = true
    void fetchPosts()
      .then((remotePosts) => {
        if (active) setPosts(remotePosts)
      })
      .catch((error) => {
        if (active) setPostsError(errorMessage(error))
      })
      .finally(() => {
        if (active) setPostsLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  const persistPost = useCallback(async (post: Post) => {
    setPostsError(null)
    try {
      const savedPost = isSupabaseConfigured
        ? await savePostForUser(post, userId ?? '')
        : post
      setPosts((items) => replacePost(items, savedPost))
    } catch (error) {
      const message = errorMessage(error)
      setPostsError(message)
      throw error
    }
  }, [userId])

  function createPost() {
    setEditingPost(null)
    setViewingPost(null)
    setComposerKey((value) => value + 1)
    setView('create')
  }

  function editDraft(post: Post) {
    setViewingPost(null)
    setEditingPost(post)
    setView('create')
  }

  function viewPost(post: Post, backView: 'dashboard' | 'calendar') {
    setViewingPost(post)
    setDetailBackView(backView)
    setView('detail')
  }

  async function editApprovedOrScheduledPost(post: Post) {
    const draftPost: Post = { ...post, status: 'draft', scheduledFor: undefined }
    await persistPost(draftPost)
    setViewingPost(null)
    setEditingPost(draftPost)
    setView('create')
  }

  const savePost = useCallback(async (post: Post) => {
    await persistPost(post)
    if (post.status === 'approved') {
      setEditingPost(null)
      setView('dashboard')
    }
  }, [persistPost])

  async function signOut() {
    await auth.signOut()
  }

  return <div className="app-shell">
    <aside className={mobile ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><WandSparkles size={20} /></div><div><strong>AasiFlowAI</strong><small>Content workspace</small></div></div>
      <button className="close" onClick={() => setMobile(false)} aria-label="Close navigation"><X /></button>
      <nav>
        <Nav active={view === 'dashboard'} icon={<LayoutDashboard />} label="Dashboard" onClick={() => { setView('dashboard'); setMobile(false) }} />
        <Nav active={view === 'create'} icon={<Sparkles />} label="Create content" onClick={() => { setView('create'); setMobile(false) }} />
        <Nav active={view === 'calendar'} icon={<CalendarDays />} label="Content calendar" onClick={() => { setView('calendar'); setMobile(false) }} />
      </nav>
      <div className="guardrail"><CheckCircle2 /><div><strong>Approval protected</strong><span>Nothing is published without your approval.</span></div></div>
    </aside>
    <main>
      <header><button className="menu" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu /></button><div><small>AI SOCIAL MEDIA WORKSPACE</small><h1>{view === 'dashboard' ? 'Welcome back, Noshad' : view === 'create' ? 'Create new content' : view === 'detail' ? 'Content details' : 'Content calendar'}</h1></div>{auth.user && <div className="account"><span>{auth.user.email}</span><button className="ghost" onClick={() => { void signOut() }} disabled={auth.loading}><LogOut /> Log out</button></div>}<button className="primary compact" onClick={createPost}><Plus /> New post</button></header>
      {(postsError ?? auth.error) && <p className="workspace-error" role="alert">{postsError ?? auth.error}</p>}
      {view === 'dashboard' && <Dashboard posts={posts} drafts={posts.filter((post) => post.status === 'draft').length} approved={posts.filter((post) => post.status === 'approved').length} scheduled={posts.filter((post) => post.status === 'scheduled').length} onCreate={createPost} onEdit={editDraft} onView={(post) => viewPost(post, 'dashboard')} loading={postsLoading} />}
      {view === 'create' && <Generator key={editingPost?.id ?? `new-${composerKey}`} initialPost={editingPost} onSave={savePost} disabled={postsLoading} />}
      {view === 'calendar' && <Calendar posts={posts} onUpdate={persistPost} onView={(post) => viewPost(post, 'calendar')} disabled={postsLoading} />}
      {view === 'detail' && viewingPost && <PostDetail post={viewingPost} onBack={() => { setViewingPost(null); setView(detailBackView) }} onEdit={editApprovedOrScheduledPost} disabled={postsLoading} />}
    </main>
    {mobile && <div className="backdrop" onClick={() => setMobile(false)} />}
  </div>
}

function Nav({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav active' : 'nav'} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Dashboard({ posts, drafts, approved, scheduled, onCreate, onEdit, onView, loading }: { posts: Post[]; drafts: number; approved: number; scheduled: number; onCreate: () => void; onEdit: (post: Post) => void; onView: (post: Post) => void; loading: boolean }) {
  return <section className="content"><div className="hero"><div><span className="eyebrow">YOUR CONTENT COMMAND CENTER</span><h2>Turn one idea into<br /><em>platform-ready content.</em></h2><p>Draft with AI, review every word, and approve only when it feels right.</p><button className="primary" onClick={onCreate} disabled={loading}><Sparkles /> Create with AI</button></div><div className="hero-orbit"><div className="orb"><WandSparkles /></div><span>IDEA</span><span>REVIEW</span><span>APPROVE</span></div></div><div className="stats"><Stat icon={<BarChart3 />} value={posts.length} label="Total content" /><Stat icon={<FileText />} value={drafts} label="Drafts" /><Stat icon={<CheckCircle2 />} value={approved} label="Approved" /><Stat icon={<Clock3 />} value={scheduled} label="Scheduled" /></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">WORKSPACE</span><h3>Recent content</h3></div><button className="ghost" onClick={onCreate} disabled={loading}>Create new <Plus /></button></div>{loading ? <div className="empty"><LoaderCircle className="spinner" /><p>Loading your content…</p></div> : posts.length === 0 ? <div className="empty"><div><Sparkles /></div><h3>Your ideas start here</h3><p>Create your first post and keep full control before anything is scheduled.</p><button className="primary" onClick={onCreate}>Create first post</button></div> : <div className="post-list">{posts.slice(0, 6).map((post) => <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong>{post.idea}</strong><p>{post.caption.slice(0, 100)}{post.caption.length > 100 ? '…' : ''}</p></div><div className="schedule-controls"><button className="ghost" onClick={() => onView(post)}>View</button>{post.status === 'draft' ? <button className="ghost" onClick={() => onEdit(post)}>Continue draft</button> : <span className={`status ${post.status}`}>{post.status}</span>}</div></article>)}</div>}</div></section>
}

function Attachment({ media }: { media: PostMedia }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const refresh = () => { void mediaPreview(media).then((value) => { if (active) { setUrl(value); setError(null) } }).catch((reason) => { if (active) { setUrl(null); setError(errorMessage(reason)) } }) }
    refresh()
    const timer = setInterval(refresh, 240000)
    return () => { active = false; clearInterval(timer) }
  }, [media])
  return <figure>{url && (media.type.startsWith('video/') ? <video src={url} controls style={{ maxWidth: '100%', maxHeight: 300 }} /> : <img src={url} alt={media.name} style={{ maxWidth: '100%', maxHeight: 300 }} />)}<figcaption>{media.name}</figcaption>{error && <p role="alert">{error}</p>}</figure>
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>
}

function PostDetail({ post, onBack, onEdit, disabled }: { post: Post; onBack: () => void; onEdit: (post: Post) => Promise<void>; disabled: boolean }) {
  const [editing, setEditing] = useState(false)

  async function edit() {
    setEditing(true)
    try {
      await onEdit(post)
    } catch {
      // The workspace displays the persistence error; keep this read-only view open.
    } finally {
      setEditing(false)
    }
  }

  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">READ-ONLY CONTENT</span><h2>{post.idea}</h2></div><button className="ghost" onClick={onBack} disabled={editing}>Back</button></div><p><span className={`status ${post.status}`}>{post.status}</span></p><dl><dt>Platform</dt><dd>{post.platform}</dd><dt>Tone</dt><dd>{post.tone}</dd><dt>Created</dt><dd>{new Date(post.createdAt).toLocaleString()}</dd>{post.scheduledFor && <><dt>Scheduled for</dt><dd>{new Date(post.scheduledFor).toLocaleString()}</dd></>}</dl>{post.media && <Attachment media={post.media} />}<h3>Caption</h3><p style={{ whiteSpace: 'pre-wrap' }}>{post.caption}</p><h3>Hashtags</h3><p>{post.hashtags.map((tag) => `#${tag}`).join(' ')}</p><button className="primary" onClick={() => { void edit() }} disabled={disabled || editing}>{editing ? 'Preparing draft…' : post.status === 'draft' ? 'Edit draft' : 'Edit'}</button></div></section>
}

function Generator({ initialPost, onSave, disabled }: { initialPost: Post | null; onSave: (post: Post) => Promise<void>; disabled: boolean }) {
  const [idea, setIdea] = useState(initialPost?.idea ?? '')
  const [platform, setPlatform] = useState<Platform>(initialPost?.platform ?? 'Instagram')
  const [tone, setTone] = useState(initialPost?.tone ?? 'Friendly')
  const [draft, setDraft] = useState<{ caption: string; hashtags: string[] } | null>(initialPost ? { caption: initialPost.caption, hashtags: initialPost.hashtags } : null)
  const [approved, setApproved] = useState(false)
  const [postId, setPostId] = useState<string | undefined>(initialPost?.id)
  const [createdAt, setCreatedAt] = useState<string | undefined>(initialPost?.createdAt)
  const [saving, setSaving] = useState(false)
  const [media, setMedia] = useState<PostMedia | undefined>(initialPost?.media)
  const [uploading, setUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const canGenerate = idea.trim().length >= 10

  const [generating, setGenerating] = useState(false)

  async function generate() {
    if (!canGenerate || saving || generating || disabled) return
    setApproved(false)
    setSaveError(null)
    setGenerating(true)
    try {
      setDraft(await generateDraft(idea, platform, tone))
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  async function save(status: 'draft' | 'approved') {
    if (!draft || (status === 'approved' && !approved)) return
    const id = postId ?? crypto.randomUUID()
    const timestamp = createdAt ?? new Date().toISOString()
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({ id, idea: idea.trim(), platform, tone, ...draft, media, status, createdAt: timestamp })
      setPostId(id)
      setCreatedAt(timestamp)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function attach(file?: File) {
    if (!file) return
    setApproved(false)
    setSaveError(null)
    setUploading(true)
    try { setMedia(await uploadMedia(file)) }
    catch (error) { setSaveError(errorMessage(error)) }
    finally { setUploading(false) }
  }

  const busy = saving || generating || uploading || disabled
  return <section className="content generator"><div className="steps"><span className={draft ? 'done' : 'current'}>1 <b>Brief</b></span><i /><span className={draft ? 'current' : ''}>2 <b>Review</b></span><i /><span>3 <b>Approve</b></span></div><div className="generator-grid"><div className="panel form-panel"><span className="eyebrow">STEP 1 — YOUR IDEA</span><h2>What do you want to share?</h2><label>Content idea<textarea value={idea} onChange={(event) => { setIdea(event.target.value); setApproved(false) }} placeholder="Example: Five simple ways small businesses can create better Instagram posts..." maxLength={500} disabled={busy} /><small>{idea.length}/500 · Minimum 10 characters</small></label><label>Photo or video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy || !isSupabaseConfigured} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void attach(file) }} /><small>{uploading ? 'Uploading…' : 'JPG, PNG, WebP or MP4 · Up to 25 MB · Save the draft to keep its attachment.'}</small></label>{media && <><Attachment media={media} /><button className="ghost" disabled={busy} onClick={() => { setMedia(undefined); setApproved(false) }}>Remove attachment from draft</button></>}<div className="field-row"><label>Platform<select value={platform} onChange={(event) => { setPlatform(event.target.value as Platform); setApproved(false) }} disabled={busy}>{['Instagram', 'LinkedIn', 'Facebook', 'X'].map((option) => <option key={option}>{option}</option>)}</select></label><label>Tone<select value={tone} onChange={(event) => { setTone(event.target.value); setApproved(false) }} disabled={busy}>{['Friendly', 'Professional', 'Bold', 'Educational'].map((option) => <option key={option}>{option}</option>)}</select></label></div><button className="primary wide" disabled={!canGenerate || busy} onClick={() => { void generate() }}><WandSparkles /> {generating ? 'Generating…' : isSupabaseConfigured ? 'Generate with AI' : 'Generate demo draft'}</button><p className="fineprint">{isSupabaseConfigured ? 'AI drafts need your review. Generation does not publish or schedule content.' : 'Demo mode: this uses a local template, not AI. Posts stay in this browser.'}</p></div><div className="panel preview-panel"><span className="eyebrow">STEP 2 — REVIEW & EDIT</span><h2>Your draft</h2>{saveError && <p className="form-error" role="alert">{saveError}</p>}{!draft ? <div className="preview-empty"><Sparkles /><p>Your generated draft will appear here.</p></div> : <><label>Caption<textarea className="caption" value={draft.caption} onChange={(event) => { setDraft({ ...draft, caption: event.target.value }); setApproved(false) }} disabled={busy} /></label><label>Hashtags<input value={draft.hashtags.map((tag) => `#${tag}`).join(' ')} onChange={(event) => { setDraft({ ...draft, hashtags: event.target.value.split(/\s+/).map((tag) => tag.replace('#', '')).filter(Boolean) }); setApproved(false) }} disabled={busy} /></label><button className="ghost draft-save" disabled={busy} onClick={() => { void save('draft') }}><FileText /> {saving ? 'Saving…' : postId ? 'Update draft' : 'Save draft'}</button><div className="approval"><input id="approve" type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={busy} /><label htmlFor="approve"><strong>I reviewed and approve this content</strong><span>Required to approve or schedule. Any edit clears approval.</span></label></div><button className="primary wide" disabled={!approved || busy} onClick={() => { void save('approved') }}><CheckCircle2 /> {saving ? 'Saving…' : 'Approve & save'}</button></>}</div></div></section>
}

function Calendar({ posts, onUpdate, onView, disabled }: { posts: Post[]; onUpdate: (post: Post) => Promise<void>; onView: (post: Post) => void; disabled: boolean }) {
  const approved = useMemo(() => posts.filter((post) => post.status === 'approved' || post.status === 'scheduled'), [posts])
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [defaultScheduleTime] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    return toDateTimeInput(tomorrow)
  })

  async function update(post: Post) {
    setSavingId(post.id)
    setError(null)
    try {
      await onUpdate(post)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSavingId(null)
    }
  }

  function schedule(post: Post) {
    const scheduledAt = new Date(scheduleTimeFor(post))
    if (!isFutureDate(scheduledAt)) {
      setError('Choose a date and time in the future.')
      return
    }
    void update({ ...post, status: 'scheduled', scheduledFor: scheduledAt.toISOString() })
  }

  function unschedule(post: Post) {
    void update({ ...post, status: 'approved', scheduledFor: undefined })
  }

  function scheduleTimeFor(post: Post) {
    return scheduleTimes[post.id] ?? (post.scheduledFor ? toDateTimeInput(new Date(post.scheduledFor)) : defaultScheduleTime)
  }

  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">APPROVED CONTENT ONLY</span><h3>Content reminders</h3><p>Dates are saved in your calendar. Automatic social publishing is not connected yet.</p></div></div>{error && <p className="form-error" role="alert">{error}</p>}{approved.length === 0 ? <div className="empty"><CalendarDays /><h3>No approved content yet</h3><p>Review and approve a draft before it can appear here.</p></div> : <div className="post-list">{approved.map((post) => { const busy = disabled || savingId === post.id; return <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong>{post.idea}</strong><p>{post.scheduledFor ? `Scheduled for ${new Date(post.scheduledFor).toLocaleString()}` : 'Approved and ready'}</p></div><div className="schedule-controls"><button className="ghost" disabled={busy} onClick={() => onView(post)}>View</button><input aria-label={`Schedule ${post.idea}`} type="datetime-local" value={scheduleTimeFor(post)} onChange={(event) => setScheduleTimes((times) => ({ ...times, [post.id]: event.target.value }))} disabled={busy} /><div><button className="ghost" disabled={busy} onClick={() => schedule(post)}><CalendarDays /> {busy ? 'Saving…' : post.status === 'approved' ? 'Schedule' : 'Reschedule'}</button>{post.status === 'scheduled' && <button className="ghost unschedule" disabled={busy} onClick={() => unschedule(post)}>Unschedule</button>}</div></div></article> })}</div>}</div></section>
}

function isFutureDate(date: Date) {
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now()
}

function toDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default App
