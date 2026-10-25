import { useEffect, useRef, useState } from 'react'
import { useVeloLocale } from '../velo/locale'
import { assetConnectionApi } from './connection-client'
import { AssetConnectionError, type AssetMetadata, type ConnectedProvider, type ConnectionStatus } from './connections'

const providers = ['canva', 'drive'] as const
const names = { canva: 'Canva', drive: 'Google Drive' }
const statusLabels = { pending: 'Authorization pending', connected: 'Connected', reconnect: 'Reconnect required', disconnected: 'Disconnected' }
export default function AssetConnections() {
  const { t } = useVeloLocale()
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [consent, setConsent] = useState<{ provider: ConnectedProvider; url: string } | null>(null)
  const [link, setLink] = useState(''), [metadata, setMetadata] = useState<AssetMetadata | null>(null)
  const mounted = useRef(false), running = useRef(false)
  const safeError = (error: unknown) => error instanceof AssetConnectionError ? error.message : 'Asset accounts are unavailable. No files were changed.'
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    assetConnectionApi.status().then(value => { if (!cancelled) setStatus(value) }).catch(error => { if (!cancelled) setError(safeError(error)) })
    return () => { cancelled = true; mounted.current = false }
  }, [])
  async function perform(action: () => Promise<void>) {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setNotice(''); setConsent(null); setMetadata(null)
    try { await action() } catch (cause) { if (mounted.current) setError(safeError(cause)) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  function connect(provider: ConnectedProvider) {
    void perform(async () => { const url = await assetConnectionApi.start(provider); if (mounted.current) setConsent({ provider, url }) })
  }
  function disconnect(provider: ConnectedProvider) {
    void perform(async () => {
      await assetConnectionApi.disconnect(provider)
      if (!mounted.current) return
      setStatus(current => current ? { ...current, connections: current.connections.map(item => item.provider === provider ? { ...item, status: 'disconnected', accountName: null } : item) } : current)
      setNotice('Velo credentials removed. Manage remaining app permissions in the provider account.')
    })
  }
  return <div className="panel velo-stack" aria-busy={busy}>
    <h2>{t('Connected asset accounts')}</h2>
    <p>{t('Connect through the provider consent screen. Never paste passwords or API keys here.')}</p>
    <p>{t('Metadata only: files are not imported, edited or published.')}</p>
    {status && !status.enabled && <p>{t('Asset account setup is pending.')}</p>}
    <ul className="velo-assets">{providers.map(provider => {
      const account = status?.connections.find(item => item.provider === provider)
      return <li key={provider}>
        <div><strong>{names[provider]}</strong><small>{t(account ? statusLabels[account.status] : 'Not connected')}{account?.accountName && <> · <span dir="auto">{account.accountName}</span></>}</small></div>
        <button type="button" className="ghost" disabled={busy || !status?.enabled || !status.configured[provider]} onClick={() => connect(provider)} aria-label={`${t('Connect')}: ${names[provider]}`}>{t('Connect')}</button>
        <button type="button" className="ghost" disabled={busy || !account || account.status === 'disconnected'} onClick={() => disconnect(provider)} aria-label={`${t('Disconnect')}: ${names[provider]}`}>{t('Disconnect')}</button>
      </li>
    })}</ul>
    <button type="button" className="ghost" disabled={busy} onClick={() => void perform(async () => { const value = await assetConnectionApi.status(); if (mounted.current) setStatus(value) })}>{t('Refresh connections')}</button>
    {consent && <a className="velo-link" href={consent.url} rel="noreferrer" referrerPolicy="no-referrer">{t('Continue to provider consent')}: {names[consent.provider]}</a>}
    <form className="velo-stack" onSubmit={event => { event.preventDefault(); void perform(async () => { const value = await assetConnectionApi.inspect(link.trim()); if (mounted.current) setMetadata(value) }) }}>
      <label>{t('Authorized design or file link')}<input required type="url" maxLength={2048} dir="ltr" value={link} onChange={event => setLink(event.target.value)} /></label>
      <p className="velo-note">{t('Google Drive links must already be authorized for this app. Pasting a link does not grant access.')}</p>
      <button type="submit" className="ghost" disabled={busy || !status?.enabled}>{busy ? t('Checking…') : t('Check file metadata')}</button>
    </form>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    {notice && <p className="form-notice" role="status">{t(notice)}</p>}
    {metadata && <div className="velo-result" role="status"><strong dir="auto">{metadata.title}</strong><p>{t('Metadata verified. Nothing was imported or changed.')}</p></div>}
  </div>
}
