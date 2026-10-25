import { useEffect, useId, useState } from 'react'
import { connectionLabel, platformLabel, queueLabel, socialLabels } from './labels.ts'
import { canCancelStatus, validateSnapshot } from './service.ts'
import type { SocialLocale, SocialPlatform, SocialPublishingApi, SocialPublishingSnapshot } from './types.ts'
import './social-publishing.css'

export interface SocialPublishingDashboardProps { enabled?: boolean; locale?: SocialLocale; api?: SocialPublishingApi; confirmCancel?: (message: string) => boolean }
const empty: SocialPublishingSnapshot = { enabled: false, connections: [], queue: [] }

export default function SocialPublishingDashboard({ enabled = false, locale = 'en', api, confirmCancel }: SocialPublishingDashboardProps) {
  const t = socialLabels(locale), id = useId()
  const [snapshot, setSnapshot] = useState<SocialPublishingSnapshot>(empty)
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const refreshError = t.refreshError
  async function refresh() {
    if (!enabled || !api) return
    setLoading(true); setError('')
    try { setSnapshot(validateSnapshot(await api.load())) }
    catch { setError(refreshError) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (!enabled || !api) return
    let active = true
    void api.load().then(value => { if (active) setSnapshot(validateSnapshot(value)) }).catch(() => { if (active) setError(refreshError) })
    return () => { active = false }
  }, [enabled, api, refreshError])
  async function connect(platform: SocialPlatform) {
    if (!enabled || !api || busy) return
    setBusy(platform); setError(''); setNotice('')
    try { await api.connect(platform); await refresh() } catch { setError(t.actionError) } finally { setBusy(null) }
  }
  async function cancel(postId: string) {
    if (!enabled || !api || busy) return
    const confirm = confirmCancel ?? ((message: string) => typeof window !== 'undefined' && window.confirm(message))
    if (!confirm(t.cancelConfirm)) return
    setBusy(postId); setError(''); setNotice('')
    try { await api.cancel(postId); await refresh(); setNotice(t.cancelDone) } catch { setError(t.actionError) } finally { setBusy(null) }
  }
  const formatDate = (value: string) => {
    try { return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
    catch { return value }
  }
  return <section className="velo-social-publishing" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} aria-labelledby={`${id}-title`} aria-busy={loading || !!busy}>
    <header className="vsp-header"><div><p className="vsp-eyebrow">VELO · SOCIAL</p><h2 id={`${id}-title`}>{t.title}</h2><p>{t.intro}</p></div><button type="button" onClick={() => void refresh()} disabled={!enabled || !api || loading || !!busy}>{t.refresh}</button></header>
    {!enabled || !api ? <p className="vsp-note" role="status">{t.paused}</p> : <>
      {!snapshot.enabled && <p className="vsp-note" role="status">{t.paused}</p>}
      <section aria-labelledby={`${id}-connections`} className="vsp-section"><h3 id={`${id}-connections`}>{t.connections}</h3><div className="vsp-platform-grid">
        {snapshot.connections.map(item => <article className="vsp-platform" key={item.platform}>
          <div className="vsp-platform-top"><h4>{platformLabel(locale,item.platform)}</h4><span className={`vsp-status vsp-status-${item.status}`}>{connectionLabel(locale,item.status)}</span></div>
          <p className="vsp-account">{item.accountLabel || t.noAccount}</p>
          {item.checkedAt && <p className="vsp-muted">{t.checked}: {formatDate(item.checkedAt)}</p>}
          {item.message && <p className="vsp-muted">{item.message}</p>}
          <button type="button" disabled={!snapshot.enabled || busy !== null || item.status === 'connected'} onClick={() => void connect(item.platform)}>{t.connect}</button>
        </article>)}
      </div></section>
      <section aria-labelledby={`${id}-queue`} className="vsp-section"><h3 id={`${id}-queue`}>{t.queue}</h3>
        {snapshot.queue.length === 0 ? <p className="vsp-note">{t.empty}</p> : <div className="vsp-queue-list">{snapshot.queue.map(item => <article className="vsp-queue-item" key={item.id}>
          <div className="vsp-queue-copy"><div className="vsp-platform-top"><h4>{platformLabel(locale,item.platform)}</h4><span className={`vsp-status vsp-status-${item.status}`}>{queueLabel(locale,item.status)}</span></div>
          <p className="vsp-caption" dir="auto">{item.caption || '—'}</p><p className="vsp-muted">{t.time}: {formatDate(item.scheduledAt)}</p>{item.error && <p className="vsp-error-detail">{t.errorDetail}: {item.error}</p>}</div>
          {canCancelStatus(item.status) && <button type="button" disabled={!snapshot.enabled || busy !== null} onClick={() => void cancel(item.id)}>{t.cancel}</button>}
        </article>)}</div>}
      </section>
    </>}
    {error && <p role="alert" className="vsp-error">{error}</p>}{notice && <p role="status" className="vsp-notice">{notice}</p>}
    <p className="vsp-footnote">{t.safeNote}</p>
  </section>
}
