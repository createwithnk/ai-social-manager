import { createDriveContent, pickedFiles, pickerMimeTypes } from './drive-content.ts'
import { checkAbort, DRIVE_SCOPE, DriveImportError, IMPORT_LIMITS, type DriveSource, type PickedDriveFile, type PickerConfig } from './types.ts'

interface Picker { setVisible(visible: boolean): void; dispose?(): void }
interface DocsView { setIncludeFolders(value: boolean): DocsView; setSelectFolderEnabled(value: boolean): DocsView; setMimeTypes(value: string): DocsView }
interface PickerBuilder {
  addView(view: DocsView): PickerBuilder; setDeveloperKey(value: string): PickerBuilder; setAppId(value: string): PickerBuilder; setOrigin(value: string): PickerBuilder
  setOAuthToken(value: string): PickerBuilder; setLocale(value: string): PickerBuilder; setMaxItems(value: number): PickerBuilder; setSelectableMimeTypes(value: string): PickerBuilder
  enableFeature(value: string): PickerBuilder; setCallback(callback: (value: unknown) => void): PickerBuilder; build(): Picker
}
interface GoogleLibraries {
  gapi?: { load(name: string, options: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void }
  google?: {
    accounts?: { oauth2: { initTokenClient(options: { client_id: string; scope: string; include_granted_scopes: boolean; prompt: string; callback(value: unknown): void; error_callback(): void }): { requestAccessToken(): void } } }
    picker?: { DocsView: new (id: string) => DocsView; ViewId: { DOCS: string }; PickerBuilder: new () => PickerBuilder; Feature: { MULTISELECT_ENABLED: string } }
  }
}
const scriptURLs = ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'] as const
const loads = new WeakMap<Document, Map<string, Promise<void>>>()
function loadScript(document: Document, url: typeof scriptURLs[number]): Promise<void> {
  let registry = loads.get(document); if (!registry) { registry = new Map(); loads.set(document, registry) }
  if (registry.has(url)) return registry.get(url)!
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = url; script.async = true; script.referrerPolicy = 'no-referrer'
    const timer = setTimeout(() => { script.remove(); reject(new DriveImportError('sdk')) }, 12000)
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new DriveImportError('sdk')) }
    document.head.append(script)
  })
  registry.set(url, promise); promise.catch(() => registry!.delete(url))
  return promise
}
export function validatePickerConfig(config: PickerConfig, origin: string) {
  if (!/^[A-Za-z0-9._-]{8,256}\.apps\.googleusercontent\.com$/.test(config.clientId) || !/^[A-Za-z0-9_-]{20,200}$/.test(config.apiKey) || !/^\d{6,30}$/.test(config.projectNumber)) throw new DriveImportError('setup')
  const url = new URL(origin)
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new DriveImportError('setup')
}
export function createGoogleDriveSource(config: PickerConfig, options: { window?: Window; fetcher?: typeof fetch; now?: () => number; load?: () => Promise<void> } = {}): DriveSource {
  const host = options.window ?? window, libraries = host as unknown as GoogleLibraries, now = options.now ?? Date.now
  validatePickerConfig(config, host.location.origin)
  let prepared = false, epoch = 0, token = '', expires = 0, dialog: Picker | undefined, stopPicking: (() => void) | undefined
  const content = createDriveContent(() => { if (!token || expires <= now() + 30000) throw new DriveImportError('expired'); return token }, options.fetcher)
  function closeDialog() {
    const previous = dialog; dialog = undefined
    try { previous?.setVisible(false) } catch { /* Cleanup must not prevent settling a selection. */ }
    try { previous?.dispose?.() } catch { /* Vendor cleanup can fail after its frame was removed. */ }
  }
  function clear() { epoch++; token = ''; expires = 0; stopPicking?.(); stopPicking = undefined; closeDialog() }
  return {
    id: crypto.randomUUID(),
    async prepare(signal) {
      checkAbort(signal); const current = epoch
      if (options.load) await options.load()
      else {
        await Promise.all(scriptURLs.map(url => loadScript(host.document, url)))
        if (!libraries.gapi) throw new DriveImportError('sdk')
        await new Promise<void>((resolve, reject) => {
          const failed = () => { clearTimeout(timer); reject(new DriveImportError('sdk')) }
          const timer = setTimeout(failed, 12000)
          try { libraries.gapi!.load('picker', { callback: () => { clearTimeout(timer); resolve() }, onerror: failed, timeout: 12000, ontimeout: failed }) } catch { failed() }
        })
      }
      checkAbort(signal)
      if (current !== epoch) throw new DriveImportError('cancelled')
      if (!libraries.google?.accounts?.oauth2 || !libraries.google.picker) throw new DriveImportError('sdk')
      prepared = true
    },
    // requestAccessToken is invoked synchronously, before any await, preserving
    // the Browse button's user gesture on mobile popup blockers.
    pick(signal) {
      if (!prepared || stopPicking) return Promise.reject(new DriveImportError('sdk'))
      checkAbort(signal); const current = epoch
      token = ''; expires = 0
      return new Promise<PickedDriveFile[]>((resolve, reject) => {
        let finished = false
        const end = (files?: PickedDriveFile[], code: 'consent' | 'cancelled' = 'consent') => {
          if (finished) return
          finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort); stopPicking = undefined
          closeDialog()
          if (files) resolve(files); else { token = ''; expires = 0; reject(new DriveImportError(code)) }
        }
        const abort = () => end(undefined, 'cancelled')
        const timer = setTimeout(() => end(undefined, 'cancelled'), 180000)
        signal.addEventListener('abort', abort, { once: true }); stopPicking = abort
        try {
          const auth = libraries.google!.accounts!.oauth2.initTokenClient({
            client_id: config.clientId, scope: DRIVE_SCOPE, include_granted_scopes: false, prompt: 'select_account', error_callback: () => end(),
            callback(value) {
              if (finished || signal.aborted || current !== epoch) { end(undefined, 'cancelled'); return }
              const response = value as Record<string, unknown> | null
              if (!response || response.error || typeof response.access_token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(response.access_token) || response.token_type !== 'Bearer' || typeof response.scope !== 'string' || response.scope.trim() !== DRIVE_SCOPE || !Number.isSafeInteger(response.expires_in) || Number(response.expires_in) < 60 || Number(response.expires_in) > 3600) { end(); return }
              token = response.access_token; expires = now() + Number(response.expires_in) * 1000
              try {
                const api = libraries.google!.picker!
                const view = new api.DocsView(api.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMimeTypes(pickerMimeTypes)
                dialog = new api.PickerBuilder().addView(view).setDeveloperKey(config.apiKey).setAppId(config.projectNumber).setOrigin(host.location.origin).setLocale(config.locale ?? 'en').setOAuthToken(token).setMaxItems(IMPORT_LIMITS.files).setSelectableMimeTypes(pickerMimeTypes).enableFeature(api.Feature.MULTISELECT_ENABLED).setCallback(data => {
                  if (finished || current !== epoch || signal.aborted) return
                  const event = data as { action?: unknown; docs?: unknown } | null
                  if (event?.action === 'cancel') end(undefined, 'cancelled')
                  else if (event?.action === 'picked') { try { end(pickedFiles(event.docs)) } catch { end() } }
                }).build()
                dialog.setVisible(true)
              } catch { end() }
            },
          })
          auth.requestAccessToken()
        } catch { end() }
      })
    },
    inspect: content.inspect,
    download: content.download,
    clear,
  }
}
