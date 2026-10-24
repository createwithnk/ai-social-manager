import { useState } from 'react'
import type { Post } from '../../types'
import { useVeloLocale } from '../velo/locale'
import { AssetLinkError, addAssetLink, createAssetLink, readAssetLinks, removeAssetLink, type AssetLink } from './links'
import { canvaBulkCsv } from './bulk-csv'

export default function AssetBridge({ ownerId, posts }: { ownerId: string; posts: readonly Post[] }) {
  const { t } = useVeloLocale()
  const [initial] = useState(() => {
    try { return { items: readAssetLinks(localStorage, ownerId), error: '' } }
    catch { return { items: [] as AssetLink[], error: 'Saved asset links need review. No links were overwritten.' } }
  })
  const [items, setItems] = useState(initial.items)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState(initial.error)
  const [notice, setNotice] = useState('')

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    try {
      const asset = createAssetLink(title, url.trim())
      setItems(addAssetLink(localStorage, ownerId, asset))
      setTitle(''); setUrl(''); setNotice('Link saved. The original file was not changed.')
    } catch (cause) { setError(cause instanceof AssetLinkError ? cause.message : 'Link storage is unavailable. No saved bookmarks were changed.') }
  }
  function remove(id: string) {
    setError(''); setNotice('')
    try { setItems(removeAssetLink(localStorage, ownerId, id)); setNotice('Bookmark removed. The original file was not deleted.') }
    catch { setError('Link storage is unavailable. No saved bookmarks were changed.') }
  }
  function downloadCsv() {
    setError('')
    let objectUrl: string | undefined
    try {
      objectUrl = URL.createObjectURL(new Blob([canvaBulkCsv(posts)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = objectUrl; link.download = 'velo-canva-bulk.csv'
      document.body.append(link); link.click(); link.remove()
    } catch { setError('The template CSV could not be downloaded.') }
    finally { if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000) }
  }
  return <div className="velo-stack">
    <div className="panel">
      <h2>{t('Canva and Google Drive links')}</h2>
      <p>{t('Bookmarks are saved only in this browser for this account. They do not sync between devices.')}</p>
      <p>{t('Files stay with their provider. Opening a link may require your Canva or Google account.')}</p>
      <p>{t('2 TB is your Google account storage allowance, not a connected Velo storage quota.')}</p>
      <form onSubmit={save} className="velo-stack">
        <label>{t('Asset name')}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>{t('Canva or Drive link')}<input required type="url" inputMode="url" dir="ltr" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} /></label>
        <button type="submit" className="primary">{t('Save link')}</button>
      </form>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {notice && <p className="form-notice" role="status">{t(notice)}</p>}
      <ul className="velo-assets">{items.map(asset => <li key={asset.id}>
        <div><strong dir="auto">{asset.title}</strong><small>{asset.source === 'canva' ? 'Canva' : 'Google Drive'}</small></div>
        <a className="ghost" href={asset.url} aria-label={`${t('Open asset')}: ${asset.title}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('Open asset')}</a>
        <button type="button" className="ghost" onClick={() => remove(asset.id)} aria-label={`${t('Remove bookmark')}: ${asset.title}`}>{t('Remove bookmark')}</button>
      </li>)}</ul>
      {!items.length && <p>{t('No saved links yet.')}</p>}
      <p className="velo-note">{t('Automatic account connection and file import are not active.')}</p>
    </div>
    <div className="panel"><h2>{t('Canva Bulk Create CSV')}</h2><p>{t('Export up to 100 saved drafts as a CSV, then upload it in Canva Bulk Create and map the columns to your template.')}</p><button type="button" className="ghost" onClick={downloadCsv}>{t('Download template CSV')}</button></div>
  </div>
}
