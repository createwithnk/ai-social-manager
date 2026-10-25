import { useRef, useState } from 'react'
import type { Post } from '../../types'
import { useVeloLocale } from '../velo/locale'
import { connectors, previewPublication, type ConnectorId, type PublishingPreview } from './connectors'

export default function PublisherPreview({ posts }: { posts: readonly Post[] }) {
  const { t } = useVeloLocale()
  const [connectorId, setConnectorId] = useState<ConnectorId>('instagram')
  const [postId, setPostId] = useState('')
  const [receipt, setReceipt] = useState<{ preview: PublishingPreview; source: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const connector = connectors.find(item => item.id === connectorId)!
  const selectedPost = posts.find(item => item.id === postId)
  const result = receipt && selectedPost && receipt.source === JSON.stringify(selectedPost) ? receipt.preview : null
  function clear() { generation.current++; setReceipt(null); setError(''); setBusy(false) }
  async function preview() {
    const post = posts.find(item => item.id === postId)
    if (!post) return
    const attempt = ++generation.current
    const source = JSON.stringify(post)
    setBusy(true); setError(''); setReceipt(null)
    try { const next = await previewPublication(post, connectorId); if (generation.current === attempt) setReceipt({ preview: next, source }) }
    catch { if (generation.current === attempt) setError('The publishing preview could not be prepared.') }
    finally { if (generation.current === attempt) setBusy(false) }
  }
  return <div className="panel velo-stack">
    <h2>{t('Publisher preview')}</h2><p role="status">{t('Preview only. Nothing is queued or published.')}</p>
    <div><label htmlFor="velo-publisher-platform">{t('Platform')}</label><select id="velo-publisher-platform" value={connectorId} onChange={event => { clear(); setConnectorId(event.target.value as ConnectorId) }}>{connectors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <p>{t(connector.requirement)}</p>
    <a className="velo-link" href={connector.documentation} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('Official setup guide')}</a>
    <div><label htmlFor="velo-publisher-post">{t('Saved post')}</label><select id="velo-publisher-post" value={postId} onChange={event => { clear(); setPostId(event.target.value) }}><option value="">{t('Choose a saved post')}</option>{posts.map(post => <option key={post.id} value={post.id}>{post.idea}</option>)}</select></div>
    <button type="button" className="primary" disabled={!postId || busy} onClick={() => { void preview() }}>{busy ? t('Checking…') : t('Check publishing plan')}</button>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    {result && <div aria-live="polite"><h3>{t('Publishing prerequisites')}</h3><ul>{result.blockers.map(item => <li key={item}>{t(item)}</li>)}</ul></div>}
    <div><h3>{t('Planned connector steps')}</h3><ol>{connector.steps.map(item => <li key={item}>{t(item)}</li>)}</ol></div>
  </div>
}
