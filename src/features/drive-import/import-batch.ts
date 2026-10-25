import { assertBatch } from './drive-content.ts'
import { checkAbort, DriveImportError, validOwner, type DriveSource, type ImportItem, type ImportReceipt, type ImportTarget } from './types.ts'

function copy(item: ImportItem): ImportItem { return { ...item, snapshot: { ...item.snapshot }, ...(item.receipt ? { receipt: { ...item.receipt, media: { ...item.receipt.media } } } : {}) } }
export function createImportBatch(source: DriveSource, target: ImportTarget, uploadDeadline = 45000, readinessDeadline = 10000) {
  let running = false
  async function ready(ownerId: string, signal: AbortSignal) {
    checkAbort(signal)
    let timer: ReturnType<typeof setTimeout> | undefined
    let remove = () => {}
    const stopped = new Promise<never>((_, reject) => {
      const cancel = () => reject(new DriveImportError('cancelled'))
      signal.addEventListener('abort', cancel, { once: true }); remove = () => signal.removeEventListener('abort', cancel)
      timer = setTimeout(() => reject(new DriveImportError('signin')), readinessDeadline)
    })
    try { await Promise.race([target.assertReady(ownerId), stopped]); checkAbort(signal) }
    finally { clearTimeout(timer); remove() }
  }
  return {
    async run(ownerId: string, original: readonly ImportItem[], signal: AbortSignal, update: (items: ImportItem[]) => void): Promise<ImportItem[]> {
      if (running) throw new DriveImportError('selection')
      if (!validOwner(ownerId)) throw new DriveImportError('signin')
      if (!target.isEnabled()) throw new DriveImportError('paused')
      if (original.some(item => item.state === 'unconfirmed' || item.state === 'uploading' || item.state === 'downloading')) throw new DriveImportError('unconfirmed')
      assertBatch(original.map(item => item.snapshot)); checkAbort(signal)
      running = true
      const items = original.map(copy)
      const emit = () => { try { update(items.map(copy)) } catch { /* A consumer callback must not turn a completed upload into a retry. */ } }
      try {
        await ready(ownerId, signal)
        for (const item of items) {
          if (item.state === 'imported') continue
          if (signal.aborted) { item.state = 'cancelled'; item.error = 'cancelled'; emit(); continue }
          item.state = 'downloading'; delete item.error; emit()
          let stage: 'download' | 'upload' = 'download'
          try {
            const verified = await source.download(item.snapshot, signal)
            checkAbort(signal); await ready(ownerId, signal)
            item.state = 'uploading'; stage = 'upload'; emit()
            let timer: ReturnType<typeof setTimeout> | undefined
            // Existing uploadMedia has no abort contract. Once sent, cancellation
            // stops later items, not a write already in flight. Never auto-retry it.
            const media = await Promise.race([
              target.upload(ownerId, verified.file),
              new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DriveImportError('unconfirmed')), uploadDeadline) }),
            ]).finally(() => clearTimeout(timer))
            if (!media || typeof media.path !== 'string' || !media.path.startsWith(`${ownerId}/`) || media.path.slice(ownerId.length + 1).includes('/') || !/^[A-Za-z0-9._-]+$/.test(media.path.slice(ownerId.length + 1)) || media.size !== verified.file.size || media.type !== verified.file.type) throw new DriveImportError('unconfirmed')
            const receipt: ImportReceipt = { driveId: verified.snapshot.id, driveVersion: verified.snapshot.version, sha256: verified.sha256, media }
            item.receipt = receipt; item.state = 'imported'; emit()
          } catch (error) {
            if (stage === 'upload') { item.state = 'unconfirmed'; item.error = 'unconfirmed'; emit(); break }
            item.error = error instanceof DriveImportError ? error.code : 'download'
            item.state = signal.aborted || item.error === 'cancelled' ? 'cancelled' : 'failed'; emit()
            if (item.error === 'expired' || item.error === 'signin' || item.error === 'paused') break
          }
        }
        return items.map(copy)
      } finally { running = false }
    },
  }
}
