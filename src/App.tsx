import { MediaInput, MediaPreview } from './components/MediaInput'
import { futureScheduleISO, validatePost } from './lib/workflow'
import { useLocale } from './lib/locale'
import LanguageSwitcher from './LanguageSwitcher'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Sparkles, WandSparkles, X } from 'lucide-react'
import { useAuth, type AuthState } from './lib/auth'
import { createDraft } from './lib/content'
import { generateAiDraft } from './lib/ai'
import { fetchPosts, savePostForUser } from './lib/posts'
import { isSupabaseConfigured } from './lib/supabase'
import MediaLibrary from './MediaLibrary'
import AdminDashboard from './AdminDashboard'
import BetaGate from './BetaGate'
import { reportRuntimeError } from './lib/monitoring'
import ModuleWorkspace from './features/velo/ModuleWorkspace'
import VeloWorkspaceHub from './features/velo-hub/VeloWorkspaceHub'
import type { ContentLanguage, Market, Platform, Post } from './types'

type View = 'dashboard' | 'create' | 'calendar' | 'detail' | 'media' | 'admin' | 'tools' | 'velo-hub'

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
  if (auth.recoveryMode) return <PasswordRecovery auth={auth} />
  if (auth.status === 'error') return <AuthBootstrapError auth={auth} />
  if (isSupabaseConfigured && !auth.user) return <AuthScreen auth={auth} />

  const workspace = <Workspace key={auth.user?.id ?? 'local-preview'} auth={auth} />
  return isSupabaseConfigured && auth.user ? <BetaGate key={auth.user.id} auth={auth}>{workspace}</BetaGate> : workspace
}

function AuthLoading() {
  const { t } = useLocale()
  return <main className="auth-shell"><section className="auth-card"><LoaderCircle className="spinner" /><h1>{t("Loading Velo")}</h1><p>{t("Checking your session securely.")}</p></section></main>
}

function AuthBootstrapError({ auth }: { auth: AuthState }) {
  const { t } = useLocale()
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-error-title"><span className="eyebrow">{t("CONNECTION ISSUE")}</span><h1 id="auth-error-title">{t("We couldn’t start your secure session")}</h1><p>{auth.error ?? 'Check your connection and Supabase configuration, then retry.'}</p><button className="primary wide" type="button" onClick={auth.retrySession}>{t("Retry session check")}</button></section></main>
}

function PasswordRecovery({ auth }: { auth: AuthState }) {
  const { t } = useLocale()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) {
      setNotice('Passwords do not match.')
      return
    }
    setNotice(null)
    const result = await auth.updatePassword(password)
    if (result.notice) {
      setFinished(true)
      setNotice(result.notice)
      setPassword('')
      setConfirm('')
    }
  }

  return <main className="auth-shell"><section className="auth-card" aria-labelledby="recovery-title"><LanguageSwitcher />
    <span className="eyebrow">{t("ACCOUNT RECOVERY")}</span>
    <h1 id="recovery-title">{t("Set a new password")}</h1>
    <p>{t("Choose a new password of at least 12 characters.")}</p>
    {!finished ? <form onSubmit={(event) => { void submit(event) }}>
      <label>{t("New password")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={auth.loading} /></label>
      <label>{t("Confirm new password")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={auth.loading} /></label>
      {auth.error && <p className="form-error" role="alert">{t(auth.error)}</p>}
      {notice && <p className="form-notice" role="status">{t(notice ?? '')}</p>}
      <button className="primary wide" type="submit" disabled={auth.loading || password !== confirm}>{auth.loading ? t("Updating…") : t("Update password")}</button>
    </form> : <p className="form-notice" role="status">{t(notice ?? '')}</p>}
    {finished && <button className="primary wide" type="button" onClick={auth.exitRecovery}>{t("Continue")}</button>}
  </section></main>
}

function AuthScreen({ auth }: { auth: AuthState }) {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null)
    const result = await auth.signIn(email, password)
    setNotice(result.notice ?? null)
    setPassword('')
  }
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title"><LanguageSwitcher />
    <span className="eyebrow">{t('UAE Private Beta')}</span><h1 id="auth-title">{t('Welcome back')}</h1>
    <p>{t('The Private Beta is invite-only. Contact the owner for access.')}</p>
    <form onSubmit={event => { void submit(event) }}>
      <label>{t('Email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" required disabled={auth.loading} /></label>
      <label>{t('Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" maxLength={128} required disabled={auth.loading} /></label>
      {auth.error && <p className="form-error" role="alert">{t(auth.error)}</p>}
      {notice && <p className="form-notice" role="status">{t(notice)}</p>}
      <button className="primary wide" disabled={auth.loading}>{auth.loading ? t('Please wait') : t('Log in')}</button>
    </form>
    <button className="auth-switch" type="button" onClick={() => { setNotice(null); void auth.requestPasswordReset(email).then(result => setNotice(result.notice ?? null)) }} disabled={auth.loading}>{t('Forgot password?')}</button>
  </section></main>
}
function Workspace({ auth }: { auth: AuthState }) {
  const { t, locale } = useLocale()
  const [view, setView] = useState<View>('dashboard')
  const [posts, setPosts] = useState<Post[]>(() => isSupabaseConfigured ? [] : loadLocalPosts())
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [viewingPost, setViewingPost] = useState<Post | null>(null)
  const [detailBackView, setDetailBackView] = useState<'dashboard' | 'calendar'>('dashboard')
  const [composerKey, setComposerKey] = useState(0)
  const [mobile, setMobile] = useState(false)
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const viewHeading = useRef<HTMLHeadingElement>(null)
  const screenKey = `${view}:${view === 'create' ? editingPost?.id ?? composerKey : view === 'detail' ? viewingPost?.id ?? '' : ''}`
  const previousScreen = useRef(screenKey)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const change = () => { setCompactNavigation(query.matches); if (!query.matches) setMobile(false) }
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!mobile || !compactNavigation) return
    const returnFocusTo = menuButton.current
    const buttons = navigation.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    buttons?.[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobile(false); event.preventDefault() }
      if (event.key === 'Tab' && buttons?.length) {
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault() }
        else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); returnFocusTo?.focus() }
  }, [mobile, compactNavigation])
  useEffect(() => {
    if (previousScreen.current === screenKey) return
    previousScreen.current = screenKey
    viewHeading.current?.focus()
  }, [screenKey])
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
    void fetchPosts(userId)
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
    if (post.status === 'draft') { editDraft(post); return }
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
    <aside id="workspace-navigation" ref={navigation} aria-hidden={compactNavigation && !mobile} inert={compactNavigation && !mobile} className={mobile ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><WandSparkles size={20} /></div><div><strong>{t("Velo")}</strong><small>{t("Content workspace")}</small></div></div>
      <button className="close" onClick={() => setMobile(false)} aria-label={t("Close navigation")}><X /></button>
      <nav>
        <Nav active={view === 'dashboard'} icon={<LayoutDashboard />} label={t("Dashboard")} onClick={() => { setView('dashboard'); setMobile(false) }} />
        <Nav active={view === 'create'} icon={<Sparkles />} label={t("Create content")} onClick={() => { createPost(); setMobile(false) }} />
        <Nav active={view === 'calendar'} icon={<CalendarDays />} label={t("Content calendar")} onClick={() => { setView('calendar'); setMobile(false) }} />
        {auth.user && <Nav active={view === 'admin'} icon={<BarChart3 />} label={t("Owner monitoring")} onClick={() => { setView('admin'); setMobile(false) }} />}
        <Nav active={view === 'tools'} icon={<WandSparkles />} label={t("Velo tools")} onClick={() => { setView('tools'); setMobile(false) }} />
        <Nav active={view === 'velo-hub'} icon={<LayoutDashboard />} label="Velo Hub" onClick={() => { setView('velo-hub'); setMobile(false) }} />
        <Nav active={view === 'media'} icon={<FileText />} label={t("Media library")} onClick={() => { setView('media'); setMobile(false) }} />
      </nav>
      <div className="guardrail"><CheckCircle2 /><div><strong>{t("Approval protected")}</strong><span>{t("Nothing is published without your approval.")}</span></div></div>
    </aside>
    <main>
      <header><LanguageSwitcher /><button ref={menuButton} aria-controls="workspace-navigation" aria-expanded={mobile} className="menu" onClick={() => setMobile(true)} aria-label={t("Open navigation")}><Menu /></button><div><small>VELO WORKSPACE</small><h1 ref={viewHeading} tabIndex={-1}>{view === 'dashboard' ? t("Your content workspace") : view === 'create' ? t("Create new content") : view === 'detail' ? t("Content details") : view === 'admin' ? t("Owner monitoring") : view === 'tools' ? t("Velo tools") : view === 'velo-hub' ? 'Velo Workspace Hub' : view === 'media' ? t("Media library") : t("Content calendar")}</h1></div>{auth.user && <div className="account"><span>{auth.user.email}</span><button className="ghost" onClick={() => { void signOut() }} disabled={auth.loading}><LogOut />{t("Log out")}</button></div>}<button className="primary compact" onClick={createPost}><Plus />{t("New post")}</button></header>
      {(postsError ?? auth.error) && <p className="workspace-error" role="alert">{t(postsError ?? auth.error ?? '')}</p>}
      {view === 'dashboard' && <Dashboard posts={posts} drafts={posts.filter((post) => post.status === 'draft').length} approved={posts.filter((post) => post.status === 'approved').length} scheduled={posts.filter((post) => post.status === 'scheduled').length} onCreate={createPost} onEdit={editDraft} onView={(post) => viewPost(post, 'dashboard')} loading={postsLoading} />}
      {view === 'create' && <Generator key={editingPost?.id ?? `new-${composerKey}`} initialPost={editingPost} userId={userId} onSave={savePost} disabled={postsLoading} />}
      {view === 'admin' && <AdminDashboard />}
      {view === 'media' && <MediaLibrary userId={userId} />}
      {view === 'tools' && <ModuleWorkspace key={userId ?? 'local-preview'} ownerId={userId ?? 'local-preview'} posts={posts} />}
      {view === 'velo-hub' && <VeloWorkspaceHub key={userId ?? 'local-preview'} ownerId={userId ?? 'local-preview'} posts={posts} initialLocale={locale === 'ar' ? 'ar' : 'en'} />}
      {view === 'calendar' && <Calendar posts={posts} onUpdate={persistPost} onView={(post) => viewPost(post, 'calendar')} disabled={postsLoading} />}
      {view === 'detail' && viewingPost && <PostDetail key={viewingPost.id} post={viewingPost} onBack={() => { setViewingPost(null); setView(detailBackView) }} onEdit={editApprovedOrScheduledPost} disabled={postsLoading} />}
    </main>
    {mobile && <div className="backdrop" onClick={() => setMobile(false)} />}
  </div>
}

function Nav({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {

  return <button className={active ? 'nav active' : 'nav'} aria-current={active ? 'page' : undefined} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Dashboard({ posts, drafts, approved, scheduled, onCreate, onEdit, onView, loading }: { posts: Post[]; drafts: number; approved: number; scheduled: number; onCreate: () => void; onEdit: (post: Post) => void; onView: (post: Post) => void; loading: boolean }) {
  const { t } = useLocale()
  return <section className="content"><div className="hero"><div><span className="eyebrow">{t("YOUR CONTENT COMMAND CENTER")}</span><h2>{t("Turn one idea into")}<br /><em>{t("platform-ready content.")}</em></h2><p>{t("Draft with AI, review every word, and approve only when it feels right.")}</p><button className="primary" onClick={onCreate} disabled={loading}><Sparkles />{t("Create with AI")}</button></div><div className="hero-orbit"><div className="orb"><WandSparkles /></div><span>{t("IDEA")}</span><span>{t("REVIEW")}</span><span>{t("APPROVE")}</span></div></div><div className="stats"><Stat icon={<BarChart3 />} value={posts.length} label={t("Total content")} /><Stat icon={<FileText />} value={drafts} label={t("Drafts")} /><Stat icon={<CheckCircle2 />} value={approved} label={t("Approved")} /><Stat icon={<Clock3 />} value={scheduled} label={t("Scheduled")} /></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">{t("WORKSPACE")}</span><h3>{t("Recent content")}</h3></div><button className="ghost" onClick={onCreate} disabled={loading}>{t("Create new")}<Plus /></button></div>{loading ? <div className="empty"><LoaderCircle className="spinner" /><p>{t("Loading your content…")}</p></div> : posts.length === 0 ? <div className="empty"><div><Sparkles /></div><h3>{t("Your ideas start here")}</h3><p>{t("Create your first post and keep full control before anything is scheduled.")}</p><button className="primary" onClick={onCreate}>{t("Create first post")}</button></div> : <div className="post-list">{posts.slice(0, 6).map((post) => <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong>{post.idea}</strong><p>{post.caption.slice(0, 100)}{post.caption.length > 100 ? t("…") : t("")}</p></div><div className="schedule-controls"><button className="ghost" onClick={() => onView(post)}>{t("View")}</button>{post.status === 'draft' ? <button className="ghost" onClick={() => onEdit(post)}>{t("Continue draft")}</button> : <span className={`status ${post.status}`}>{t(post.status)}</span>}</div></article>)}</div>}</div></section>
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>
}

function PostDetail({ post, onBack, onEdit, disabled }: { post: Post; onBack: () => void; onEdit: (post: Post) => Promise<void>; disabled: boolean }) {
  const { t, locale } = useLocale()
  const [editing, setEditing] = useState(false)
  const [editConfirmed, setEditConfirmed] = useState(false)
  const requiresConfirmation = post.status !== 'draft'

  async function edit() {
    if (disabled || editing || (requiresConfirmation && !editConfirmed)) return
    setEditing(true)
    try {
      await onEdit(post)
    } catch {
      // Workspace shows the conflict/error and retains the existing post.
    } finally {
      setEditing(false)
    }
  }

  return <section className="content"><div className="panel">
    <div className="panel-head"><div><span className="eyebrow">{t("READ-ONLY CONTENT")}</span><h2>{post.idea}</h2></div><button className="ghost" onClick={onBack} disabled={editing}>{t("Back")}</button></div>
    <p><span className={`status ${post.status}`}>{t(post.status)}</span></p>
    <dl><dt>{t("Platform")}</dt><dd>{t(post.platform)}</dd><dt>{t("Tone")}</dt><dd>{t(post.tone)}</dd><dt>{t("Created")}</dt><dd>{new Date(post.createdAt).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-GB')}</dd>{post.scheduledFor && <><dt>{t("Scheduled for")}</dt><dd>{new Date(post.scheduledFor).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-GB')}</dd></>}</dl>
    {post.media && <MediaPreview media={post.media} />}
    <h3>{t("Caption")}</h3><p dir={post.language === 'ar' || post.language === 'ur' ? 'rtl' : 'ltr'} lang={post.language ?? 'en'} style={{ whiteSpace: 'pre-wrap' }}>{post.caption}</p>
    <h3>{t("Hashtags")}</h3><p>{post.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
    {requiresConfirmation && <div className="approval">
      <input id="confirm-edit" type="checkbox" checked={editConfirmed} onChange={event => setEditConfirmed(event.target.checked)} disabled={disabled || editing} />
      <label htmlFor="confirm-edit"><strong>{t("I approve converting this post to a draft")}</strong><span>{t("This removes its approval and schedule. Changed content must be reviewed and approved again before saving.")}</span></label>
    </div>}
    <button className="primary" onClick={() => { void edit() }} disabled={disabled || editing || (requiresConfirmation && !editConfirmed)}>{editing ? t("Preparing draft…") : post.status === 'draft' ? t("Edit draft") : t("Edit")}</button>
  </div></section>
}

function Generator({ initialPost, onSave, disabled, userId }: { userId?: string; initialPost: Post | null; onSave: (post: Post) => Promise<Post | void>; disabled: boolean }) {
  const { t } = useLocale()
  const [idea, setIdea] = useState(initialPost?.idea ?? '')
  const [platform, setPlatform] = useState<Platform>(initialPost?.platform ?? 'Instagram')
  const [tone, setTone] = useState(initialPost?.tone ?? 'Friendly')
  const [language, setLanguage] = useState<ContentLanguage>(initialPost?.language ?? 'en')
  const [market, setMarket] = useState<Market>(initialPost ? initialPost.market ?? 'General' : 'UAE')
  const [media, setMedia] = useState(initialPost?.media)
  const [uploading, setUploading] = useState(false)
  const [draft, setDraft] = useState<{ caption: string; hashtags: string[] } | null>(initialPost ? { caption: initialPost.caption, hashtags: initialPost.hashtags } : null)
  const [approved, setApproved] = useState(false)
  const [postId, setPostId] = useState<string | undefined>(initialPost?.id)
  const [revision, setRevision] = useState(initialPost?.revision)
  const [createdAt, setCreatedAt] = useState<string | undefined>(initialPost?.createdAt)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const canGenerate = idea.trim().length >= 10 && idea.trim().length <= 500
  const [generatedBrief, setGeneratedBrief] = useState<string | null>(initialPost ? JSON.stringify([initialPost.idea.trim(), initialPost.platform, initialPost.tone, initialPost.language ?? 'en', initialPost.market ?? 'General', initialPost.media]) : null)
  const currentBrief = JSON.stringify([idea.trim(), platform, tone, language, market, media])
  const draftMatchesBrief = generatedBrief === currentBrief
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null)
  const fingerprint = JSON.stringify([idea.trim(), platform, tone, language, market, media, draft?.caption, draft?.hashtags])
  const isApproved = approved && reviewedFingerprint === fingerprint && draftMatchesBrief

  async function generate() {
    if (!canGenerate || generating || saving || uploading || disabled) return
    const requestedBrief = currentBrief
    setGenerating(true)
    setSaveError(null)
    setApproved(false)
    setReviewedFingerprint(null)
    setGeneratedBrief(null)
    setDraft(null)
    try {
      const result = isSupabaseConfigured
        ? await generateAiDraft(idea, platform, tone, language, market, media)
        : createDraft(idea, platform, tone, language)
      setDraft(result)
      setGeneratedBrief(requestedBrief)
    } catch (error) {
      void reportRuntimeError('ai_failed')
      setSaveError(errorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  async function save(status: 'draft' | 'approved') {
    if (saving || generating || uploading || disabled || !draft || !draft.caption.trim() || !draftMatchesBrief || !idea.trim() || idea.trim().length > 500 || !isApproved) return
    const id = postId ?? crypto.randomUUID()
    const timestamp = createdAt ?? new Date().toISOString()
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await onSave({ id, idea: idea.trim(), platform, tone, language, market, media, revision, ...draft, status, createdAt: timestamp })
      if (saved) setRevision(saved.revision)
      setPostId(id)
      setCreatedAt(saved?.createdAt ?? timestamp)
      setApproved(false)
      setReviewedFingerprint(null)
    } catch (error) {
      void reportRuntimeError('save_failed')
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || generating || uploading || disabled
  return <section className="content generator"><div className="steps"><span className={draft ? 'done' : 'current'}>{t("1")}<b>{t("Brief")}</b></span><i /><span className={draft ? 'current' : ''}>{t("2")}<b>{t("Review")}</b></span><i /><span>{t("3")}<b>{t("Approve")}</b></span></div><div className="generator-grid"><div className="panel form-panel"><span className="eyebrow">{t("STEP 1 — YOUR IDEA")}</span><h2>{t("What do you want to share?")}</h2><label>{t("Content idea")}<textarea aria-label={t('Content idea')} aria-describedby="idea-help" value={idea} onChange={(event) => { setIdea(event.target.value); setApproved(false); setReviewedFingerprint(null) }} placeholder={t("Example: Five simple ways small businesses can create better Instagram posts...")} maxLength={500} disabled={busy} /><small id="idea-help">{idea.length}{t("/500 · Minimum 10 characters")}</small></label><div className="field-row"><label>{t("Platform")}<select aria-label={t('Platform')} value={platform} onChange={(event) => { setPlatform(event.target.value as Platform); setApproved(false); setReviewedFingerprint(null) }} disabled={busy}>{['Instagram', 'LinkedIn', 'Facebook', 'X'].map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label><label>{t("Tone")}<select aria-label={t('Tone')} value={tone} onChange={(event) => { setTone(event.target.value); setApproved(false); setReviewedFingerprint(null) }} disabled={busy}>{['Friendly', 'Professional', 'Bold', 'Educational'].map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label></div><div className="field-row"><label>{t("Content language")}<select aria-label={t("Content language")} value={language} onChange={(event) => { setLanguage(event.target.value as ContentLanguage); setApproved(false); setReviewedFingerprint(null) }} disabled={busy}><option value="en">{t("English")}</option><option value="ar">{t("العربية")}</option><option value="hi">{t("Hindi")}</option><option value="ur">{t("Urdu")}</option></select></label><label>{t("Target market")}<select aria-label={t("Target market")} value={market} onChange={(event) => { setMarket(event.target.value as Market); setApproved(false); setReviewedFingerprint(null) }} disabled={busy}>{['General', 'UAE', 'Saudi Arabia', 'Kuwait', 'Gulf'].map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label></div><MediaInput userId={userId} media={media} onBusy={setUploading} disabled={busy || !userId} onChange={(value) => { setMedia(value); setApproved(false); setReviewedFingerprint(null) }} /><button className="primary wide" disabled={!canGenerate || busy} onClick={() => { void generate() }}><WandSparkles /> {generating ? t("Generating…") : t("Generate draft")}</button><p className="fineprint">{t("AI drafts use a secure server-side provider when signed in. Local preview mode uses templates. Every post still requires your approval.")}</p>{saveError && !draft && <p className="form-error" role="alert">{t(saveError)}</p>}</div><div className="panel preview-panel"><span className="eyebrow">{t("STEP 2 — REVIEW & EDIT")}</span><h2>{t("Your draft")}</h2>{!draft ? <div className="preview-empty"><Sparkles /><p>{t("Your generated draft will appear here.")}</p></div> : <><label>{t("Caption")}<textarea aria-label={t('Caption')} className="caption" dir={language === 'ar' || language === 'ur' ? 'rtl' : 'ltr'} lang={language} value={draft.caption} onChange={(event) => { setDraft({ ...draft, caption: event.target.value }); setApproved(false); setReviewedFingerprint(null) }} disabled={busy} /></label><label>{t("Hashtags")}<input aria-label={t('Hashtags')} dir={language === 'ar' || language === 'ur' ? 'rtl' : 'ltr'} value={draft.hashtags.map((tag) => `#${tag}`).join(' ')} onChange={(event) => { setDraft({ ...draft, hashtags: event.target.value.split(/\s+/).map((tag) => tag.replace('#', '')).filter(Boolean) }); setApproved(false); setReviewedFingerprint(null) }} disabled={busy} /></label>{saveError && <p className="form-error" role="alert">{t(saveError)}</p>}<div className="approval"><input id="approve" type="checkbox" checked={isApproved && draftMatchesBrief} onChange={(event) => { setApproved(event.target.checked); setReviewedFingerprint(event.target.checked ? fingerprint : null) }} disabled={busy || !draftMatchesBrief} /><label htmlFor="approve"><strong>{t("I reviewed and approve this content")}</strong><span>{t("Required before every save. Saving a draft does not schedule or publish it.")}</span></label></div>
      <button className="ghost draft-save" disabled={busy || !draftMatchesBrief || !isApproved} onClick={() => { void save('draft') }}><FileText /> {saving ? t("Saving…") : postId ? t("Update draft") : t("Save draft")}</button>
      <button className="primary wide" disabled={!isApproved || !draftMatchesBrief || busy} onClick={() => { void save('approved') }}><CheckCircle2 /> {saving ? t("Saving…") : t("Approve & save")}</button></>}</div></div></section>
}

function Calendar({ posts, onUpdate, onView, disabled }: { posts: Post[]; onUpdate: (post: Post) => Promise<Post | void>; onView: (post: Post) => void; disabled: boolean }) {
  const { t, locale } = useLocale()
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

  function schedule(post: Post, selectedTime: string) {
    if (disabled || savingId !== null) return
    if (post.status !== 'approved' && post.status !== 'scheduled') { setError('Approve the content before scheduling.'); return }
    try {
      const scheduledFor = futureScheduleISO(selectedTime)
      void update({ ...post, status: 'scheduled', scheduledFor })
    } catch {
      setError('Choose a future scheduling time.')
    }
  }

  function unschedule(post: Post) {
    if (disabled || savingId !== null) return
    void update({ ...post, status: 'approved', scheduledFor: undefined })
  }

  function scheduleTimeFor(post: Post) {
    return scheduleTimes[post.id] ?? (post.scheduledFor ? toDateTimeInput(new Date(post.scheduledFor)) : defaultScheduleTime)
  }

  return <section className="content"><div className="panel"><div className="panel-head"><div><span className="eyebrow">{t("APPROVED CONTENT ONLY")}</span><h3>{t("Ready to schedule")}</h3></div></div>{error && <p className="form-error" role="alert">{t(error)}</p>}{approved.length === 0 ? <div className="empty"><CalendarDays /><h3>{t("No approved content yet")}</h3><p>{t("Review and approve a draft before it can appear here.")}</p></div> : <div className="post-list">{approved.map((post) => { const busy = disabled || savingId !== null; return <article className="post" key={post.id}><div className="platform">{post.platform[0]}</div><div><strong>{post.idea}</strong><p>{post.scheduledFor ? `${t("Scheduled for")} ${new Date(post.scheduledFor).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-GB')}` : t("Approved and ready")}</p></div><div className="schedule-controls"><button className="ghost" disabled={busy} onClick={() => onView(post)}>{t("View")}</button><input aria-label={`${t("Schedule")} ${post.idea}`} type="datetime-local" value={scheduleTimeFor(post)} onChange={(event) => setScheduleTimes((times) => ({ ...times, [post.id]: event.target.value }))} disabled={busy} /><div><button className="ghost" disabled={busy} onClick={() => schedule(post, scheduleTimeFor(post))}><CalendarDays /> {busy ? t("Saving…") : post.status === 'approved' ? t("Schedule") : t("Reschedule")}</button>{post.status === 'scheduled' && <button className="ghost unschedule" disabled={busy} onClick={() => unschedule(post)}>{t("Unschedule")}</button>}</div></div></article> })}</div>}</div></section>
}

function toDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default App
