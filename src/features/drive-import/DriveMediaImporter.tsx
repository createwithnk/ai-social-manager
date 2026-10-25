import { useEffect, useMemo, useRef, useState } from 'react'
import { createImportBatch } from './import-batch.ts'
import { driveLabels, errorLabel, stateLabel } from './labels.ts'
import { DriveImportError, validOwner, type DriveImportCode, type DriveSource, type ImportItem, type ImportReceipt, type ImportTarget } from './types.ts'
import { veloMediaTarget } from './velo-target'
import './drive-import.css'

export interface DriveMediaImporterProps {
  ownerId: string
  source: DriveSource
  locale?: 'en' | 'ar'
  target?: ImportTarget
  enabled?: boolean
  onImported?: (receipts: readonly ImportReceipt[]) => void
}
export default function DriveMediaImporter(props: DriveMediaImporterProps) {
  return <DriveImportSession key={`${props.ownerId}:${props.source.id}`} {...props} />
}
function DriveImportSession({ ownerId, source, locale = 'en', target = veloMediaTarget, enabled = false, onImported }: DriveMediaImporterProps) {
  const labels = driveLabels(locale)
  const [items, setItems] = useState<ImportItem[]>([]), [prepared, setPrepared] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState<DriveImportCode | null>(null), [notice, setNotice] = useState<'ready' | 'complete' | null>(null)
  const active = useRef(false), running = useRef(false), abort = useRef<AbortController | null>(null)
  const completed = useRef(new Map<string, ImportReceipt>())
  const batch = useMemo(() => createImportBatch(source, target), [source, target])
  useEffect(() => {
    active.current = true
    return () => { active.current = false; abort.current?.abort(); source.clear() }
  }, [source])
  const valid = enabled && validOwner(ownerId)
  const unconfirmed = items.some(item => item.state === 'unconfirmed')
  const imported = items.some(item => item.state === 'imported')
  async function perform(work: (signal: AbortSignal, current: () => boolean) => Promise<void>) {
    if (running.current || !valid) return
    running.current = true; setBusy(true); setError(null); setNotice(null)
    const controller = new AbortController(); abort.current = controller
    const current = () => active.current
    try { await work(controller.signal, current) }
    catch (cause) { if (current()) setError(cause instanceof DriveImportError ? cause.code : 'download') }
    finally { running.current = false; if (current()) setBusy(false) }
  }
  function browse() {
    // perform calls the async work immediately; source.pick starts the popup before its first await.
    void perform(async (signal, current) => {
      const selection = await source.pick(signal)
      const snapshots = await source.inspect(selection, signal)
      if (current()) setItems(snapshots.map(snapshot => {
        const receipt = completed.current.get(`${snapshot.id}:${snapshot.version}`)
        return receipt ? { snapshot, state: 'imported', receipt } : { snapshot, state: 'selected' }
      }))
    })
  }
  function importFiles() {
    void perform(async (signal, current) => {
      const newReceipts: ImportReceipt[] = []
      const result = await batch.run(ownerId, items, signal, values => {
        if (!current()) return
        for (const item of values) if (item.receipt && !completed.current.has(`${item.receipt.driveId}:${item.receipt.driveVersion}`)) {
          completed.current.set(`${item.receipt.driveId}:${item.receipt.driveVersion}`, item.receipt); newReceipts.push(item.receipt)
        }
        setItems(values)
      })
      if (!current()) return
      setItems(result); setNotice('complete')
      // Callback failure cannot undo a confirmed upload or cause an automatic retry.
      try { if (newReceipts.length) onImported?.(newReceipts) } catch { /* The receipts remain visible in this panel. */ }
    })
  }
  return <section className="velo-drive-import" dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-busy={busy} aria-label={labels.title}>
    <h2>{labels.title}</h2><p>{labels.intro}</p><p>{labels.limits}</p><p className="drive-note">{labels.privacy}</p>
    {!target.isEnabled() && <p className="drive-notice" role="status">{labels.paused}</p>}
    {!valid && <p role="status">{labels.signin}</p>}
    <div className="drive-actions">
      <button type="button" disabled={!valid || busy || prepared} onClick={() => void perform(async (signal, current) => { await source.prepare(signal); if (current()) { setPrepared(true); setNotice('ready') } })}>{labels.prepare}</button>
      <button type="button" disabled={!valid || busy || !prepared || unconfirmed} onClick={browse}>{labels.browse}</button>
      <button type="button" disabled={!valid || busy || !items.length || !target.isEnabled() || unconfirmed || items.every(item => item.state === 'imported')} onClick={importFiles}>{labels.import}</button>
      {busy && <button type="button" onClick={() => abort.current?.abort()}>{labels.cancel}</button>}
      <button type="button" disabled={busy || unconfirmed} onClick={() => { source.clear(); setItems([]); setError(null); setNotice(null); setPrepared(false) }}>{labels.clear}</button>
    </div>
    {busy && <p role="status">{labels.loading}</p>}
    {error && <p className="drive-error" role="alert">{errorLabel(locale, error)}</p>}
    {notice && <p role="status">{labels[notice]}</p>}
    {unconfirmed && <p role="alert">{labels.uncertain}</p>}
    {imported && <p role="status">{labels.imported}</p>}
    <h3>{labels.select}</h3>
    {!items.length && <p>{labels.noFiles}</p>}
    <ul>{items.map(item => <li key={item.snapshot.id}><strong dir="auto">{item.snapshot.name}</strong><span>{(item.snapshot.bytes / (1024 * 1024)).toFixed(2)} MiB</span><span>{stateLabel(locale, item.state)}</span>{item.error && <small>{errorLabel(locale, item.error)}</small>}</li>)}</ul>
  </section>
}
