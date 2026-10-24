import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { authorizationLink } from '../assets/connections'
import { CanvaBridgeError, linkedReference, ownerId as validOwner, reference, referenceKey, referenceUrl, type CanvaKind, type CanvaReference } from '../../../supabase/functions/_shared/canva-catalog/contracts.ts'
import { bounded } from './catalog'
import { canvaError, canvaLabels } from './labels'
import { mappingState, postFingerprint, readWorkspace, removeMapping, saveMapping, saveReference, scheduledPost, workspaceKey } from './mappings'
import { veloCanvaCatalog } from './velo-catalog'
import type { CanvaBridgeProps, WorkspaceRead } from './types'
import './canva-bridge.css'

export default function CanvaCreativeBridge({ enabled = false, locale = 'en', ...props }: CanvaBridgeProps) {
  const text = canvaLabels(locale)
  const catalog = useMemo(() => props.catalog ?? veloCanvaCatalog(props.ownerId), [props.catalog, props.ownerId])
  if (!enabled) return <section className="velo-canva-bridge" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}><h2>{text.heading}</h2><p>{text.paused}</p></section>
  try { validOwner(props.ownerId) } catch { return <section className="velo-canva-bridge" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}><p role="alert">{canvaError(locale,'sign_in')}</p></section> }
  return <CanvaPanel key={`${props.ownerId}:${catalog.id}`} {...props} enabled locale={locale} catalog={catalog} />
}
function CanvaPanel({ ownerId, posts, storage: suppliedStorage, locale = 'en', catalog }: CanvaBridgeProps & { catalog: NonNullable<CanvaBridgeProps['catalog']> }) {
  const t = canvaLabels(locale), id = useId()
  const [initial] = useState(() => {
    try { const storage = suppliedStorage ?? window.localStorage; return { storage, data: readWorkspace(storage,ownerId), error: null } }
    catch { return { storage: suppliedStorage, data: null, error: 'storage' as const } }
  })
  const [data,setData] = useState<WorkspaceRead | null>(initial.data), [error,setError] = useState(initial.error ? canvaError(locale,initial.error) : ''), [notice,setNotice] = useState('')
  const [busy,setBusy] = useState(false), [kind,setKind] = useState<CanvaKind>('design'), [query,setQuery] = useState('')
  const [items,setItems] = useState<CanvaReference[]>([]), [continuation,setContinuation] = useState<string|null>(null), [loadedQuery,setLoadedQuery] = useState<{ kind: CanvaKind; query: string }|null>(null)
  const [selected,setSelected] = useState<CanvaReference|null>(null), [postId,setPostId] = useState(''), [title,setTitle] = useState(''), [url,setUrl] = useState(''), [consent,setConsent] = useState('')
  const [states,setStates] = useState<Record<string,'current'|'changed'|'missing'>>({})
  const storageRef = useRef(initial.storage)
  const mounted = useRef(false), running = useRef(false), controller = useRef<AbortController|null>(null), postsRef = useRef(posts)
  useEffect(() => { postsRef.current = posts }, [posts])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => {
    let active = true
    void Promise.all((data?.value.mappings ?? []).map(async item => [item.postId, await mappingState(item,posts)] as const)).then(values => { if (active) setStates(Object.fromEntries(values)) }).catch(() => { if (active) setStates({}) })
    return () => { active = false }
  }, [data,posts])
  useEffect(() => {
    function changed(event: StorageEvent) { if (event.key === workspaceKey(ownerId) || event.key === null) { controller.current?.abort(); setError(canvaError(locale,'conflict')); setData(null); setSelected(null) } }
    window.addEventListener('storage',changed)
    return () => window.removeEventListener('storage',changed)
  }, [ownerId,locale])
  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setNotice(''); setConsent('')
    const control = new AbortController(); controller.current = control
    try { await action(control.signal) }
    catch (cause) { if (mounted.current) setError(canvaError(locale,cause instanceof CanvaBridgeError ? cause.code : 'unavailable')) }
    finally { running.current = false; if (mounted.current) setBusy(false); if (controller.current === control) controller.current = null }
  }
  async function load(signal: AbortSignal, nextPage = false) {
    const input = nextPage && loadedQuery ? { ...loadedQuery, continuation: continuation ?? undefined } : { kind,query }
    const result = await bounded(signal, inner => catalog.list(input,inner))
    if (!mounted.current || signal.aborted) return
    setItems(result.items.map(reference)); setContinuation(result.continuation); setLoadedQuery({ kind: input.kind,query: input.query }); setSelected(null)
  }
  function savedLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running.current || !data || !storageRef.current) return
    setError(''); setNotice('')
    try {
      const item = linkedReference(title,url.trim()), next = saveReference(storageRef.current,ownerId,data,item)
      setData(next); setSelected(item); setTitle(''); setUrl(''); setNotice(t.savedNotice)
    } catch (cause) { setError(canvaError(locale,cause instanceof CanvaBridgeError ? cause.code : 'storage')) }
  }
  async function mapSelected(signal: AbortSignal) {
    if (!data || !storageRef.current || !selected) throw new CanvaBridgeError('invalid')
    const post = postsRef.current.find(item => item.id === postId)
    if (!scheduledPost(post)) throw new CanvaBridgeError('post_changed')
    const fingerprint = await postFingerprint(post), picked = reference(selected)
    if (picked.origin === 'account') {
      const latest = await bounded(signal, inner => catalog.get(picked,inner))
      if (latest.id !== picked.id || latest.kind !== picked.kind || latest.updatedAt !== picked.updatedAt || latest.origin !== 'account') throw new CanvaBridgeError('asset_changed')
    }
    if (!mounted.current || signal.aborted) return
    const next = await saveMapping(storageRef.current,ownerId,data,picked,postId,fingerprint,() => mounted.current && !signal.aborted ? postsRef.current : [])
    if (mounted.current && !signal.aborted) { setData(next); setNotice(t.mapped) }
  }
  const available = posts.filter(scheduledPost), replacement = data?.value.mappings.some(item => item.postId === postId)
  const format = (date: string) => new Date(date).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-GB')
  const cards = (rows: readonly CanvaReference[]) => <ul className="vcb-list">{rows.map(item => <li key={referenceKey(item)}>
    <div><strong dir="auto">{item.title}</strong><small>{item.kind === 'design' ? t.design : t.template} · {item.origin === 'link' ? t.linkOnly : t.verified}</small></div>
    <div className="vcb-actions"><a href={referenceUrl(item)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t.open}</a><button type="button" disabled={busy || !data} aria-pressed={!!selected && referenceKey(selected) === referenceKey(item)} onClick={() => { setSelected(item); setNotice('') }}>{t.select}: <span dir="auto">{item.title}</span></button></div>
  </li>)}</ul>
  return <section className="velo-canva-bridge" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} aria-labelledby={`${id}-heading`} aria-busy={busy}>
    <header><span className="vcb-eyebrow">VELO · CANVA</span><h2 id={`${id}-heading`}>{t.heading}</h2><p>{t.intro}</p></header>
    <p className="vcb-boundary">{t.boundary}</p><p className="vcb-note">{t.local}</p>
    <div className="vcb-grid"><div className="vcb-card">
      <h3>{t.account}</h3><p className="vcb-note">{t.permission}</p>
      <button type="button" disabled={busy} onClick={() => void perform(async signal => { const raw = await bounded(signal,inner => catalog.connect(inner)); const safe = authorizationLink(raw,'canva'); if (mounted.current && !signal.aborted) setConsent(safe) })}>{t.connect}</button>
      {consent && <p><a href={consent} rel="noreferrer" referrerPolicy="no-referrer">{t.consent}</a></p>}
      <form onSubmit={event => { event.preventDefault(); void perform(signal => load(signal)) }}>
        <label>{t.kind}<select aria-label={t.kind} value={kind} disabled={busy} onChange={event => { setKind(event.target.value as CanvaKind); setItems([]); setContinuation(null); setLoadedQuery(null); setSelected(null) }}><option value="design">{t.design}</option><option value="brand-template">{t.template}</option></select></label>
        <label>{t.query}<input value={query} maxLength={120} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
        <div className="vcb-actions"><button type="submit" disabled={busy}>{t.search}</button><button type="button" disabled={busy || !continuation} onClick={() => void perform(signal => load(signal,true))}>{t.more}</button></div>
      </form>
      {items.length ? cards(items) : <p className="vcb-note">{t.empty}</p>}
    </div><div className="vcb-card">
      <h3>{t.saveLink}</h3><form onSubmit={savedLink}>
        <label>{t.title}<input required maxLength={200} value={title} disabled={busy || !data} onChange={event => setTitle(event.target.value)} /></label>
        <label>{t.url}<input type="url" required dir="ltr" maxLength={2048} value={url} disabled={busy || !data} onChange={event => setUrl(event.target.value)} /></label>
        <button type="submit" disabled={busy || !data}>{t.add}</button>
      </form><h3>{t.saved}</h3>{data?.value.references.length ? cards(data.value.references) : <p className="vcb-note">{t.noSaved}</p>}
    </div></div>
    <div className="vcb-card"><h3>{t.selected}</h3>{selected && <p><strong dir="auto">{selected.title}</strong><br /><small>{selected.origin === 'account' ? t.verified : t.linkOnly}</small></p>}
      <label>{t.post}<select aria-label={t.post} value={postId} disabled={busy || !data} onChange={event => setPostId(event.target.value)}><option value="">{t.choose}</option>{available.map(post => <option key={post.id} value={post.id}>{post.platform} · {post.idea.slice(0,80)} · {format(post.scheduledFor)}</option>)}</select></label>
      {!available.length && <p>{t.noPosts}</p>}{replacement && <p className="vcb-note">{t.replaced}</p>}
      <button type="button" disabled={busy || !selected || !postId || !data || !available.some(item => item.id === postId)} onClick={() => void perform(mapSelected)}>{replacement ? t.replace : t.map}</button><p className="vcb-note">{t.pinNote}</p>
    </div>
    <div className="vcb-card"><h3>{t.mappings}</h3>{data?.value.mappings.length ? <ul className="vcb-list">{data.value.mappings.map(item => <li key={item.postId}>
      <div><strong dir="auto">{item.reference.title}</strong><small dir="auto">{posts.find(post => post.id === item.postId)?.idea.slice(0,120) ?? item.postId}</small><small>{t.scheduledAt}: {format(item.scheduledFor)}</small><small role="status">{states[item.postId] ? t[states[item.postId]] : t.checking}</small></div>
      <button type="button" disabled={busy || !data} onClick={() => { try { if (!storageRef.current) throw new CanvaBridgeError('storage'); setData(removeMapping(storageRef.current,ownerId,data,item.postId)); setError(''); setNotice(t.removed) } catch (cause) { setError(canvaError(locale,cause instanceof CanvaBridgeError ? cause.code : 'storage')) } }}>{t.remove}</button>
    </li>)}</ul> : <p className="vcb-note">{t.noMappings}</p>}</div>
    <div className="vcb-actions"><button type="button" disabled={busy} onClick={() => { try { const storage = suppliedStorage ?? window.localStorage; setData(readWorkspace(storage,ownerId)); storageRef.current = storage; setError(''); setNotice('') } catch { setError(canvaError(locale,'storage')) } }}>{t.reload}</button>{busy && <button type="button" onClick={() => controller.current?.abort()}>{t.cancel}</button>}</div>
    {error && <p className="vcb-error" role="alert">{error}</p>}{notice && <p className="vcb-notice" role="status">{notice}</p>}
  </section>
}
