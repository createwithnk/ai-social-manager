import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { useAuth, type AuthState } from './lib/auth'
import { AuthScreen, PasswordRecoveryScreen } from './components/AuthScreens'
import { MediaInput, MediaPreview } from './components/MediaInput'
import { ConnectionsPanel } from './components/ConnectionsPanel'
import { validatePost, captionLimits } from './lib/workflow'
import { createDraft, generateContent } from './lib/content'
import { fetchPosts, savePostForUser } from './lib/posts'
import { isSupabaseConfigured } from './lib/supabase'
import type { Platform, Post } from './types'
import { LocaleProvider } from './components/LocaleProvider'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useLocale } from './lib/locale-context'
import { contentLanguageTag } from './lib/locale'

type View = 'dashboard' | 'create' | 'calendar' | 'detail' | 'settings'

function loadLocalPosts(): Post[] {
  try {
    const saved = JSON.parse(localStorage.getItem('aasiflow-posts') || '[]')
    return Array.isArray(saved) ? saved.slice(0,200).filter(post => { try { validatePost(post,0); return typeof post.id === 'string' && typeof post.createdAt === 'string' && Number.isFinite(Date.parse(post.createdAt)) } catch { return false } }) : []
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
  return <LocaleProvider><AuthenticatedApp /></LocaleProvider>
}

function AuthenticatedApp() {
  const auth = useAuth()

  if (auth.status === 'loading') return <AuthLoading />
  if (auth.status === 'error') return <AuthBootstrapError auth={auth} />
  if (auth.user && auth.recovering) return <PasswordRecoveryScreen auth={auth} />
  if (isSupabaseConfigured && !auth.user) return <AuthScreen auth={auth} />

  return <Workspace key={auth.user?.id ?? 'local'} auth={auth} />
}

function AuthLoading() {
  const { t } = useLocale()
  return <main className="auth-shell"><section className="auth-card"><LanguageSwitcher /><LoaderCircle className="spinner" /><h1>{t("Loading AasiFlowAI")}</h1><p>{t("Checking your session securely.")}</p></section></main>
}

function AuthBootstrapError({ auth }: { auth: AuthState }) {
  const { t, error: translateError } = useLocale()
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-error-title"><LanguageSwitcher /><span className="eyebrow">{t("CONNECTION ISSUE")}</span><h1 id="auth-error-title">{t("We couldn’t start your secure session")}</h1><p>{auth.error ? translateError(auth.error) : t("Check your connection and Supabase configuration, then retry.")}</p><button className="primary wide" type="button" onClick={auth.retrySession}>{t("Retry session check")}</button></section></main>
}

function Workspace({ auth }: { auth: AuthState }) {
  const { t, error: translateError } = useLocale()
  const [view, setView] = useState<View>(() => new URLSearchParams(location.search).get('screen') === 'settings' ? 'settings' : 'dashboard')
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
      validatePost(post)
      if (!isSupabaseConfigured) localStorage.setItem('aasiflow-posts', JSON.stringify(replacePost(posts, post)))
      const savedPost = isSupabaseConfigured
        ? await savePostForUser(post, userId ?? '')
        : post
      setPosts((items) => replacePost(items, savedPost))
      return savedPost
    } catch (error) {
      const message = errorMessage(error)
      setPostsError(message)
      throw error
    }
  }, [userId, posts])

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
    const saved = await persistPost(draftPost)
    setViewingPost(null)
    setEditingPost(saved)
    setView('create')
  }

  const savePost = useCallback(async (post: Post) => {
    const saved = await persistPost(post)
    if (post.status === 'approved') {
      setEditingPost(null)
      setView('dashboard')
    }
    return saved
  }, [persistPost])

  async function signOut() {
    await auth.signOut()
  }

  return <div className="app-shell">
    <aside className={mobile ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><WandSparkles size={20} /></div><div><strong>AasiFlowAI</strong><small>{t("Content workspace")}</small></div></div>
      <button className="close" onClick={() => setMobile(false)} aria-label={t("Close navigation")}><X /></button>
      <nav>
        <Nav active={view === 'dashboard'} icon={<LayoutDashboard />} label={t("Dashboard")} onClick={() => { setView('dashboard'); setMobile(false) }} />
        <Nav active={view === 'create'} icon={<Sparkles />} label={t("Create content")} onClick={() => { setView('create'); setMobile(false) }} />
        <Nav active={view === 'calendar'} icon={<CalendarDays />} label={t("Content calendar")} onClick={() => { setView('calendar'); setMobile(false) }} />
        <Nav active={view === 'settings'} icon={<CheckCircle2 />} label={t("Connections & setup")} onClick={() => { setView('settings'); setMobile(false) }} />
      </nav>
      <div className="guardrail"><CheckCircle2 /><div><strong>{t("Approval protected")}</strong><span>{t("Nothing is published without your approval.")}</span></div></div>
    </aside>
    <main>
      <header><button className="menu" onClick={() => setMobile(true)} aria-label={t("Open navigation")}><Menu /></button><div className="header-heading"><small>{t("AI SOCIAL MEDIA WORKSPACE")}</small><h1>{view === 'dashboard' ? t("Your content workspace") : view === 'create' ? t("Create new content") : view === 'detail' ? t("Content details") : view === 'settings' ? t("Connections & setup") : t("Content calendar")}</h1></div><div className="header-actions"><LanguageSwitcher />{auth.user && <div className="account"><span><bdi dir="ltr">{auth.user.email}</bdi></span><button className="ghost" onClick={() => { void signOut() }} disabled={auth.loading}><LogOut /> {t("Log out")}</button></div>}<button className="primary compact" onClick={createPost}><Plus /> {t("New post")}</button></div></header>
      <p className="workspace-notice">{t("Review is required before publishing. Calendar dates are plans only.")} {isSupabaseConfigured ? t("Account storage connected.") : t("Local demo: drafts stay in this browser.")}</p>
      {view === 'settings' && <ConnectionsPanel userId={userId} posts={posts} />}
      {(postsError ?? auth.error) && <p className="workspace-error" role="alert">{translateError(postsError ?? auth.error ?? '')}</p>}
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
  const { t } = useLocale()
  return <section className="content"><div className="hero"><div><span className="eyebrow">{t("YOUR CONTENT COMMAND CENTER")}</span><h2>{t("Turn one idea into")}<br /><em>{t("platform-ready content.")}</em></h2><p>{t("Draft with AI, review every word, and approve only when it feels right.")}</p><button className="primary" onClick={onCreate} disabled={loading}><Sparkles /> {t("Create with AI")}</button></div><div className="hero-orbit"><div className="orb"><WandSparkles /></div><span>{t("IDEA")}</span><span>{t("REVIEW")}</span><span>{t("APPROVE")}</span></div></div><div className="stats"><Stat icon={<BarChart3 />} value={posts.length} label={t("Total content")} /><Stat icon={<FileText />} value={drafts} label={t("Drafts")} /><Stat icon={<CheckCircle2 />} value={approved} label={t("Approved")} /><Stat icon={<Clock3 />} value={scheduled} label={t("Scheduled")} /></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">{t("WORKSPACE")}</span><h3>{t("Recent content")}</h3></div><button className="ghost" onClick={onCreate} disabled={loading}>{t("Create new")} <Plus /></button></div>{loading ? <div className="empty"><LoaderCircle className="spinner" /><p>{t("Loading your content…")}</p></div> : posts.length === 0 ? <div className="empty"><div><Sparkles /></div><h3>{t("Your ideas start here")}</h3><p>{t("Create your first post and keep full control before anything is scheduled.")}</p><button className="primary" onClick={onCreate}>{t("Create first post")}</button></div> : <div className="post-list">{posts.slice(0, 6).map((post) => <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong dir="auto">{post.idea}</strong><p dir="auto" lang={contentLanguageTag(post.language)}>{post.caption.slice(0, 100)}{post.caption.length > 100 ? '…' : ''}</p></div><div className="schedule-controls"><button className="ghost" onClick={() => onView(post)}>{t("View")}</button>{post.status === 'draft' ? <button className="ghost" onClick={() => onEdit(post)}>{t("Continue draft")}</button> : <span className={`status ${post.status}`}>{t(post.status)}</span>}</div></article>)}</div>}</div></section>
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  const { number } = useLocale()
  return <div className="stat"><div className="stat-icon">{icon}</div><div><strong>{typeof value === 'number' ? number(value) : value}</strong><span>{label}</span></div></div>
}

function PostDetail({ post, onBack, onEdit, disabled }: { post: Post; onBack: () => void; onEdit: (post: Post) => Promise<void>; disabled: boolean }) {
  const { t, date } = useLocale()
  const [editing, setEditing] = useState(false)

  async function edit() {
    setEditing(true)
    try {
      await onEdit(post)
    } catch {
      // Workspace displays the save error and leaves the approved post intact.
    } finally {
      setEditing(false)
    }
  }

  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">{t("READ-ONLY CONTENT")}</span><h2 dir="auto">{post.idea}</h2></div><button className="ghost" onClick={onBack} disabled={editing}>{t("Back")}</button></div><p><span className={`status ${post.status}`}>{t(post.status)}</span></p><dl><dt>{t("Platform")}</dt><dd>{post.platform}</dd><dt>{t("Tone")}</dt><dd>{t(post.tone)}</dd><dt>{t("Created")}</dt><dd>{date(post.createdAt)}</dd>{post.scheduledFor && <><dt>{t("Scheduled for")}</dt><dd>{date(post.scheduledFor)}</dd></>}</dl>{post.media && <MediaPreview media={post.media} />}<h3>{t("Caption")}</h3><p dir="auto" lang={contentLanguageTag(post.language)} style={{ whiteSpace: 'pre-wrap' }}>{post.caption}</p><h3>{t("Hashtags")}</h3><p dir="auto">{post.hashtags.map((tag) => `#${tag}`).join(' ')}</p><button className="primary" onClick={() => { void edit() }} disabled={disabled || editing}>{editing ? t("Preparing draft…") : post.status === 'draft' ? t("Edit draft") : t("Edit")}</button></div></section>
}

function Generator({ initialPost, onSave, disabled }: { initialPost: Post | null; onSave: (post: Post) => Promise<Post>; disabled: boolean }) {
  const { t, locale, number, error: translateError } = useLocale()
  const [idea, setIdea] = useState(initialPost?.idea ?? '')
  const [platform, setPlatform] = useState<Platform>(initialPost?.platform ?? 'Instagram')
  const [tone, setTone] = useState(initialPost?.tone ?? 'Friendly')
  const [draft, setDraft] = useState<{ caption: string; hashtags: string[] } | null>(initialPost ? { caption: initialPost.caption, hashtags: initialPost.hashtags } : null)
  const [approved, setApproved] = useState(false)
  const [postId, setPostId] = useState<string | undefined>(initialPost?.id)
  const [revision,setRevision] = useState(initialPost?.revision)
  const [createdAt, setCreatedAt] = useState<string | undefined>(initialPost?.createdAt)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [language, setLanguage] = useState(initialPost?.language ?? (locale === 'ar' ? 'Arabic' : 'English'))
  const [media, setMedia] = useState(initialPost?.media)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const canGenerate = idea.trim().length >= 10
  function changed() { setApproved(false); setSaved(false) }
  async function generateAI() {
    if (!canGenerate) return
    setGenerating(true); changed(); setSaveError(null)
    try { setDraft(await generateContent(idea, platform, tone, language, media)) } catch (error) { setSaveError(errorMessage(error)) } finally { setGenerating(false) }
  }

  function generate() {
    if (!canGenerate) return
    changed()
    setDraft(createDraft(idea, platform, tone))
    setApproved(false)
    setSaveError(null)
  }

  async function save(status: 'draft' | 'approved') {
    if (!draft || (status === 'approved' && !approved)) return
    const id = postId ?? crypto.randomUUID()
    const timestamp = createdAt ?? new Date().toISOString()
    setSaving(true)
    setSaveError(null)
    try {
      const savedPost = await onSave({ id, idea: idea.trim(), platform, tone, ...draft, media, language, status, createdAt: timestamp,revision })
      setRevision(savedPost.revision)
      setPostId(id)
      setCreatedAt(savedPost.createdAt)
      setSaved(true)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || disabled || generating || uploading
  return <section className="content generator"><div className="steps"><span className={draft ? 'done' : 'current'}>1 <b>{t("Brief")}</b></span><i /><span className={draft ? 'current' : ''}>2 <b>{t("Review")}</b></span><i /><span>3 <b>{t("Approve")}</b></span></div><div className="generator-grid"><div className="panel form-panel"><span className="eyebrow">{t("STEP 1 — YOUR IDEA")}</span><h2>{t("What do you want to share?")}</h2><label>{t("Content idea")}<textarea aria-label={t("Content idea")} dir="auto" lang={contentLanguageTag(language)} value={idea} onChange={(event) => { changed(); setIdea(event.target.value) }} placeholder={t("Example: Five simple ways small businesses can create better Instagram posts...")} maxLength={500} disabled={busy} /><small>{t('{count}/{limit} · Minimum {minimum} characters', { count: number(idea.length), limit: number(500), minimum: number(10) })}</small></label><div className="field-row"><label>{t("Platform")}<select aria-label={t("Platform")} value={platform} onChange={(event) => { changed(); setPlatform(event.target.value as Platform) }} disabled={busy}>{['Instagram', 'LinkedIn', 'Facebook', 'X'].map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label><label>{t("Tone")}<select aria-label={t("Tone")} value={tone} onChange={(event) => { changed(); setTone(event.target.value) }} disabled={busy}>{['Friendly', 'Professional', 'Bold', 'Educational'].map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label></div><label>{t("Language")}<select aria-label={t("Language")} value={language} disabled={busy} onChange={event => { changed(); setLanguage(event.target.value) }}>{['English','Hindi','Urdu','Arabic'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><MediaInput media={media} disabled={busy || !isSupabaseConfigured} onBusy={setUploading} onChange={value => { changed(); setMedia(value) }} /><button className="primary wide" disabled={!canGenerate || busy || !isSupabaseConfigured} onClick={() => { void generateAI() }}>{generating ? t("Generating…") : t("Generate with AI")}</button><button className="ghost wide" disabled={!canGenerate || busy} onClick={generate}><WandSparkles /> {t("Use local template")}</button><p className="fineprint">{t("Local templates use English and your typed idea only. AI uses your selected language and attachment; these are sent to Gemini when you generate.")}</p>{saveError && <p className="form-error" role="alert">{translateError(saveError)}</p>}{saved && <p role="status">{t("Draft saved.")}</p>}</div><div className="panel preview-panel"><span className="eyebrow">{t("STEP 2 — REVIEW & EDIT")}</span><h2>{t("Your draft")}</h2>{!draft ? <div className="preview-empty"><Sparkles /><p>{t("Your generated draft will appear here.")}</p></div> : <><label>{t("Caption")}<textarea aria-label={t("Caption")} dir="auto" lang={contentLanguageTag(language)} className="caption" value={draft.caption} onChange={(event) => { changed(); setDraft({ ...draft, caption: event.target.value }) }} disabled={busy} /></label><p className="fineprint">{t("Caption + hashtags limit:")} {number(captionLimits[platform])} {t("characters.")}</p><label>{t("Hashtags")}<input aria-label={t("Hashtags")} dir="auto" value={draft.hashtags.map((tag) => `#${tag}`).join(' ')} onChange={(event) => { changed(); setDraft({ ...draft, hashtags: event.target.value.split(/\s+/).map((tag) => tag.replace('#', '')).filter(Boolean) }) }} disabled={busy} /></label>{saveError && <p className="form-error" role="alert">{translateError(saveError)}</p>}<button className="ghost draft-save" disabled={busy} onClick={() => { void save('draft') }}><FileText /> {saving ? t("Saving…") : postId ? t("Update draft") : t("Save draft")}</button><div className="approval"><input id="approve" aria-label={t("I reviewed and approve this content")} aria-describedby="approval-help" type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={busy} /><label htmlFor="approve"><strong>{t("I reviewed and approve this content")}</strong><span id="approval-help">{t("Required to approve or schedule. Drafts can be saved without approval.")}</span></label></div><button className="primary wide" disabled={!approved || busy} onClick={() => { void save('approved') }}><CheckCircle2 /> {saving ? t("Saving…") : t("Approve & save")}</button></>}</div></div></section>
}

function Calendar({ posts, onUpdate, onView, disabled }: { posts: Post[]; onUpdate: (post: Post) => Promise<Post>; onView: (post: Post) => void; disabled: boolean }) {
  const { t, date, error: translateError } = useLocale()
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
    const scheduledAt = new Date(scheduleTimes[post.id] ?? defaultScheduleTime)
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) { setError('Choose a future date and time.'); return }
    void update({ ...post, status: 'scheduled', scheduledFor: scheduledAt.toISOString() })
  }

  function unschedule(post: Post) {
    void update({ ...post, status: 'approved', scheduledFor: undefined })
  }

  function scheduleTimeFor(post: Post) {
    return scheduleTimes[post.id] ?? (post.scheduledFor ? toDateTimeInput(new Date(post.scheduledFor)) : defaultScheduleTime)
  }

  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">{t("APPROVED CONTENT ONLY")}</span><h3>{t("Ready to schedule")}</h3></div></div><p className="fineprint">{t('Dates and times use {zone}. Calendar entries do not publish automatically.', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>{error && <p className="form-error" role="alert">{translateError(error)}</p>}{approved.length === 0 ? <div className="empty"><CalendarDays /><h3>{t("No approved content yet")}</h3><p>{t("Review and approve a draft before it can appear here.")}</p></div> : <div className="post-list">{approved.map((post) => { const busy = disabled || savingId === post.id; return <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong dir="auto">{post.idea}</strong><p>{post.scheduledFor ? t('Scheduled for {date}', { date: date(post.scheduledFor) }) : t("Approved and ready")}</p></div><div className="schedule-controls"><button className="ghost" disabled={busy} onClick={() => onView(post)}>{t("View")}</button><input aria-label={t('Schedule {idea}', { idea: post.idea })} type="datetime-local" dir="ltr" value={scheduleTimeFor(post)} onChange={(event) => setScheduleTimes((times) => ({ ...times, [post.id]: event.target.value }))} disabled={busy} /><div><button className="ghost" disabled={busy} onClick={() => schedule(post)}><CalendarDays /> {busy ? t("Saving…") : post.status === 'approved' ? t("Schedule") : t("Reschedule")}</button>{post.status === 'scheduled' && <button className="ghost unschedule" disabled={busy} onClick={() => unschedule(post)}>{t("Unschedule")}</button>}</div></div></article> })}</div>}</div></section>
}

function toDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default App
