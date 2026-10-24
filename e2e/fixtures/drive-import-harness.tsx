// Test-only host. Not imported by the application or its production bundle.
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import DriveMediaImporter from '../../src/features/drive-import/DriveMediaImporter'
import { DriveImportError, type DriveSource, type ImportTarget } from '../../src/features/drive-import/types.ts'

const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222'
export default function Harness() {
  const [owner, setOwner] = useState(A), [shown, setShown] = useState(true)
  const mode = new URLSearchParams(location.search).get('mode'), locale = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en'
  const source = useMemo<DriveSource>(() => ({
    id: 'synthetic-source', prepare: async () => {}, pick: async () => [{ id: 'file_fixture' }],
    inspect: async () => [{ id: 'file_fixture', name: 'منتج تجريبي.png', mimeType: 'image/png', bytes: 9, version: '1', modifiedTime: '2026-10-24T00:00:00Z' }],
    download: async snapshot => {
      if (mode === 'changed') throw new DriveImportError('changed')
      return { snapshot, sha256: 'a'.repeat(64), file: new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], snapshot.name, { type: 'image/png' }) }
    }, clear: () => {},
  }), [mode])
  const target = useMemo<ImportTarget>(() => ({
    isEnabled: () => mode !== 'paused', assertReady: async () => {},
    upload: async (userId, file) => {
      document.body.dataset.uploads = String(Number(document.body.dataset.uploads ?? '0') + 1)
      if (mode === 'uncertain') throw new Error('private-storage-sentinel')
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 120))
      return { path: `${userId}/opaque-fixture`, name: file.name, type: file.type, size: file.size }
    },
  }), [mode])
  return <main style={{ padding: 12, fontFamily: 'sans-serif' }}>
    <button onClick={() => setOwner(owner === A ? B : A)}>Switch test owner</button>
    <button onClick={() => setShown(value => !value)}>Toggle panel</button>
    {shown && <DriveMediaImporter ownerId={owner} source={source} target={mode === 'default-paused' ? undefined : target} enabled locale={locale} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
