import { useLocale } from './lib/locale'
import { useCallback, useEffect, useState } from 'react'
import { listMedia, uploadMedia, type MediaItem } from './lib/media'

export default function MediaLibrary({ userId }: { userId?: string }) {
  const { t } = useLocale()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!userId) return
    let active = true
    void listMedia(userId).then((media) => { if (active) setItems(media) })
      .catch((error) => { if (active) setError(error instanceof Error ? error.message : 'Media could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, attempt])
  const refresh = useCallback(() => { setLoading(true); setError(null); setAttempt((value) => value + 1) }, [])
  async function upload(file?: File) {
    if (!file || !userId || busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await uploadMedia(userId, file); setNotice('Media uploaded privately.'); refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'Upload failed.') }
    finally { setBusy(false) }
  }
  return <section className="content"><div className="panel">
    <div className="panel-head"><div><span className="eyebrow">{t("PRIVATE MEDIA")}</span><h2>{t("Your images and videos")}</h2></div><button className="ghost" onClick={refresh} disabled={!userId || busy || loading}>{t("Refresh previews")}</button></div>
    <p>{t("Images, videos and audio up to 10 MiB. Private previews expire after five minutes; refresh to renew them.")}</p>
    <p>{t('Existing storage limits: 20 files per user and 80 files per project. Media deletion requires owner maintenance.')}</p>
    {!userId && <p className="form-notice">{t("Sign in to upload and manage private media.")}</p>}
    <label>{t("Upload media")}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/ogg" disabled={!userId || busy || loading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file) }} /></label>
    {busy && <p role="status">{t("Saving media…")}</p>}{loading && <p role="status">{t("Loading private previews…")}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}{notice && <p className="form-notice" role="status">{t(notice)}</p>}
    <div className="media-grid">{items.map((item) => <article key={item.path} className="media-card">
      {item.kind === 'image' ? <img src={item.url} alt={t("Uploaded private media")} loading="lazy" onError={() => setError('Preview expired or unavailable. Refresh previews.')} /> : item.kind === 'audio' ? <audio src={item.url} controls preload="metadata" onError={() => setError('Preview expired or unavailable. Refresh previews.')} /> : <video src={item.url} controls preload="metadata" onError={() => setError('Preview expired or unavailable. Refresh previews.')} />}
      <p>{t("Media deletion requires owner maintenance.")}</p>
    </article>)}</div>
    {!loading && !items.length && userId && !error && <p>{t("No media yet. Upload a file to get started.")}</p>}
  </div></section>
}
