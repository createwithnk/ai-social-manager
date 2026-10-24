import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBatch, contentSha256, createDriveContent, pickedFiles } from '../src/features/drive-import/drive-content.ts'
import { createGoogleDriveSource, validatePickerConfig } from '../src/features/drive-import/google-picker.ts'
import { createImportBatch } from '../src/features/drive-import/import-batch.ts'
import { DRIVE_SCOPE, DriveImportError, IMPORT_LIMITS } from '../src/features/drive-import/types.ts'
import { driveLabels } from '../src/features/drive-import/labels.ts'

const A = 'a1111111-1111-4111-8111-111111111111'
const signal = () => new AbortController().signal
const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0])
const metadata = overrides => ({ id: 'file_fixture', name: 'Product photo.png', mimeType: 'image/png', size: '9', version: '7', modifiedTime: '2026-10-24T00:00:00Z', trashed: false, isAppAuthorized: true, capabilities: { canDownload: true }, ...overrides })
const snap = overrides => ({ id: 'file_fixture', name: 'Product photo.png', mimeType: 'image/png', bytes: 9, version: '7', modifiedTime: '2026-10-24T00:00:00Z', ...overrides })
const media = { path: `${A}/opaque-fixture`, name: 'Product photo.png', type: 'image/png', size: 9 }
const file = new File([bytes], 'Product photo.png', { type: 'image/png' })
const item = overrides => ({ snapshot: snap(), state: 'selected', ...overrides })
const error = code => value => value instanceof DriveImportError && value.code === code
function transport(values, inspect = () => {}) {
  let index = 0
  return async (url, init) => { inspect(url, init); const value = values[index++]; assert.notEqual(value, undefined, 'Unexpected request'); return value instanceof Response ? value : Response.json(value) }
}
function source(overrides = {}) { return { id: 'source-fixture', prepare: async () => {}, pick: async () => [{ id: 'file_fixture' }], inspect: async () => [snap()], download: async () => ({ file, snapshot: snap(), sha256: 'a'.repeat(64) }), clear: () => {}, ...overrides } }
function target(overrides = {}) { return { isEnabled: () => true, assertReady: async () => {}, upload: async () => media, ...overrides } }

test('Drive selection is bounded, deduplicated and excludes arbitrary URLs/resource-key headers', () => {
  for (const value of [[], [{ id: '../escape' }], [{ id: 'file_fixture', resourceKey: 'newline\r\nheader' }], [{ id: 'file_fixture' }, { id: 'file_fixture' }], Array.from({ length: 6 }, (_, i) => ({ id: `fixture_${i}` }))]) assert.throws(() => pickedFiles(value), error('selection'))
  assert.deepEqual(pickedFiles([{ id: 'file_fixture', url: 'https://evil.example', accessToken: 'not-forwarded' }]), [{ id: 'file_fixture' }])
  assert.throws(() => assertBatch([snap({ bytes: IMPORT_LIMITS.fileBytes + 1 })]), error('size'))
  assert.throws(() => assertBatch([snap({ bytes: NaN })]), error('size'))
})
test('Drive download pins metadata across bytes, verifies SHA/signature and only calls fixed Google GET endpoints', async () => {
  const hash = await contentSha256(bytes), calls = []
  const meta = metadata({ sha256Checksum: hash })
  const content = createDriveContent(() => 'fixture-access-token', transport([meta, new Response(bytes, { headers: { 'Content-Type': 'image/png' } }), meta], (url, init) => {
    calls.push(new URL(url)); assert.equal(new URL(url).origin, 'https://www.googleapis.com'); assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer fixture-access-token'); assert.equal(init.headers['X-Goog-Drive-Resource-Keys'], 'file_fixture/resource_fixture'); assert.equal(url.includes('fixture-access-token'), false)
  }))
  const result = await content.download(snap({ sha256: hash, resourceKey: 'resource_fixture' }), signal())
  assert.equal(result.sha256, hash); assert.equal(result.file.size, 9); assert.equal(result.file.type, 'image/png')
  assert.equal(calls.filter(url => url.searchParams.get('alt') === 'media').length, 1)
})
test('changed Drive revisions are rejected both before and after content reads', async () => {
  const before = createDriveContent(() => 'fixture-token', transport([metadata({ version: '8' })]))
  await assert.rejects(before.download(snap(), signal()), error('changed'))
  const after = createDriveContent(() => 'fixture-token', transport([metadata(), new Response(bytes, { headers: { 'Content-Type': 'image/png' } }), metadata({ version: '8' })]))
  await assert.rejects(after.download(snap(), signal()), error('changed'))
})
test('Drive Docs/shortcuts, blocked downloads, wrong content and oversized batches fail without import', async () => {
  for (const overrides of [{ mimeType: 'application/vnd.google-apps.document' }, { mimeType: 'image/svg+xml' }, { capabilities: { canDownload: false } }, { isAppAuthorized: false }, { size: String(IMPORT_LIMITS.fileBytes + 1) }]) await assert.rejects(createDriveContent(() => 'fixture-token', transport([metadata(overrides)])).inspect([{ id: 'file_fixture' }], signal()))
  await assert.rejects(createDriveContent(() => 'fixture-token', transport([metadata(), new Response('<html>bad', { headers: { 'Content-Type': 'image/png' } })])).download(snap(), signal()), error('unsupported'))
  const values = [0,1,2].map(i => metadata({ id: `fixture_${i}`, size: String(IMPORT_LIMITS.fileBytes) }))
  await assert.rejects(createDriveContent(() => 'fixture-token', transport(values)).inspect(values.map(value => ({ id: value.id })), signal()), error('size'))
})
test('Drive response sizes, slow streams, redirects and cancellation are bounded', async () => {
  const stalled = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([123])) } }), { headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(createDriveContent(() => 'fixture-token', async () => stalled(), 5).inspect([{ id: 'file_fixture' }], signal()), error('download'))
  const large = new Response(new Uint8Array(32769), { headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(createDriveContent(() => 'fixture-token', transport([large])).inspect([{ id: 'file_fixture' }], signal()), error('size'))
  await assert.rejects(createDriveContent(() => 'fixture-token', transport([new Response(null, { status: 302 })])).inspect([{ id: 'file_fixture' }], signal()), error('download'))
  const controller = new AbortController(); controller.abort()
  await assert.rejects(createDriveContent(() => 'fixture-token', async () => { throw new Error('Unexpected request') }).inspect([{ id: 'file_fixture' }], controller.signal), error('cancelled'))
})
test('Drive checksum mismatch and revoked tokens never return an importable file or provider details', async () => {
  const reader = createDriveContent(() => 'fixture-token', transport([metadata({ sha256Checksum: '0'.repeat(64) }), new Response(bytes, { headers: { 'Content-Type': 'image/png' } })]))
  await assert.rejects(reader.download(snap({ sha256: '0'.repeat(64) }), signal()), error('changed'))
  await assert.rejects(createDriveContent(() => 'fixture-token', transport([new Response('private-provider-sentinel', { status: 401 })])).inspect([{ id: 'file_fixture' }], signal()), error('expired'))
})
function pickerFixture() {
  const captured = {}; let auth, callback
  class View { setIncludeFolders() { return this } setSelectFolderEnabled() { return this } setMimeTypes() { return this } }
  class Builder {
    addView() { return this } setDeveloperKey() { return this } setAppId() { return this } setOrigin(value) { captured.origin = value; return this } setLocale() { return this } setMaxItems(value) { captured.max = value; return this } setSelectableMimeTypes() { return this } enableFeature() { return this }
    setOAuthToken(value) { captured.token = value; return this } setCallback(value) { callback = value; return this }
    build() { return { setVisible(value) { captured.visible = value }, dispose() { captured.disposed = true; if (captured.failCleanup) throw new Error('Synthetic removed frame') } } }
  }
  const window = { location: { origin: 'https://velo.example' }, google: { accounts: { oauth2: { initTokenClient(config) { auth = config; return { requestAccessToken() { captured.requested = true } } } } }, picker: { DocsView: View, ViewId: { DOCS: 'docs' }, PickerBuilder: Builder, Feature: { MULTISELECT_ENABLED: 'multi' } } } }
  const config = { clientId: 'fixture-client.apps.googleusercontent.com', apiKey: 'fixture-restricted-browser-key', projectNumber: '123456789' }
  const source = createGoogleDriveSource(config, { window, load: async () => {}, now: () => 1000, fetcher: async () => { throw new Error('Unexpected transport') } })
  return { source, captured, get auth() { return auth }, pick: value => callback(value) }
}
test('Picker starts consent synchronously, requests only selected-file scope and exposes no bearer in selection', async () => {
  const f = pickerFixture(); await f.source.prepare(signal()); const pending = f.source.pick(signal())
  assert.equal(f.captured.requested, true); assert.equal(f.auth.scope, DRIVE_SCOPE); assert.equal(f.auth.include_granted_scopes, false)
  f.auth.callback({ access_token: 'fixture-memory-token', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE })
  assert.equal(f.captured.origin, 'https://velo.example'); assert.equal(f.captured.max, 5)
  f.captured.failCleanup = true
  f.pick({ action: 'picked', docs: [{ id: 'file_fixture', name: 'Private fixture', url: 'https://evil.example' }] })
  assert.deepEqual(await pending, [{ id: 'file_fixture' }]); assert.equal(f.captured.disposed, true); f.source.clear()
  await assert.rejects(f.source.inspect([{ id: 'file_fixture' }], signal()), error('expired'))
})
test('late Picker consent after unmount/cancel is ignored and broad scopes are rejected', async () => {
  for (const mode of ['cancel', 'broad']) {
    const f = pickerFixture(); await f.source.prepare(signal()); const pending = f.source.pick(signal())
    if (mode === 'cancel') f.source.clear()
    f.auth.callback({ access_token: 'fixture-memory-token', token_type: 'Bearer', expires_in: 3600, scope: mode === 'broad' ? DRIVE_SCOPE + ' https://www.googleapis.com/auth/drive' : DRIVE_SCOPE })
    await assert.rejects(pending, error(mode === 'cancel' ? 'cancelled' : 'consent'))
    assert.equal(f.captured.token, undefined)
  }
  assert.throws(() => validatePickerConfig({ clientId: 'bad', apiKey: 'bad', projectNumber: 'bad' }, 'https://velo.example'), error('setup'))
})
test('paused uploads and invalid owners stop before Google downloads or Storage calls', async () => {
  let io = 0
  const batch = createImportBatch(source({ download: async () => { io++; throw new Error() } }), target({ isEnabled: () => false, upload: async () => { io++; return media } }))
  await assert.rejects(batch.run(A, [item()], signal(), () => {}), error('paused'))
  await assert.rejects(batch.run('local-preview', [item()], signal(), () => {}), error('signin')); assert.equal(io, 0)
})
test('batch preserves confirmed imports, reports partial failures and never retries successful items', async () => {
  let uploads = 0
  const s = source({ download: async value => { if (value.id === 'bad_fixture') throw new DriveImportError('changed'); return { file, snapshot: value, sha256: 'a'.repeat(64) } } })
  const batch = createImportBatch(s, target({ upload: async () => { uploads++; return media } }))
  const input = [item(), item({ snapshot: snap({ id: 'bad_fixture' }) })]
  const first = await batch.run(A, input, signal(), () => {})
  assert.deepEqual(first.map(value => value.state), ['imported', 'failed']); assert.equal(input[0].state, 'selected')
  const second = await batch.run(A, first, signal(), () => {})
  assert.equal(second[0].receipt.media.path, media.path); assert.equal(uploads, 1)
})
test('uncertain uploads stop the batch and cannot be blindly retried or rolled back', async () => {
  let uploads = 0
  const batch = createImportBatch(source(), target({ upload: async () => { uploads++; throw new Error('private-storage-sentinel') } }))
  const result = await batch.run(A, [item(), item({ snapshot: snap({ id: 'next_fixture' }) })], signal(), () => {})
  assert.equal(result[0].state, 'unconfirmed'); assert.equal(result[1].state, 'selected'); assert.equal(JSON.stringify(result).includes('private-storage-sentinel'), false)
  await assert.rejects(batch.run(A, result, signal(), () => {}), error('unconfirmed')); assert.equal(uploads, 1)
})
test('upload deadlines remain unconfirmed and cancellation never promises to undo an in-flight write', async () => {
  const timeout = createImportBatch(source(), target({ upload: () => new Promise(() => {}) }), 5)
  assert.equal((await timeout.run(A, [item()], signal(), () => {}))[0].state, 'unconfirmed')
  const controller = new AbortController()
  const batch = createImportBatch(source(), target({ upload: async () => { controller.abort(); return media } }))
  const results = await batch.run(A, [item(), item({ snapshot: snap({ id: 'next_fixture' }) })], controller.signal, () => {})
  assert.deepEqual(results.map(value => value.state), ['imported', 'cancelled'])
})
test('batch rejects concurrent starts and checks target authorization again before uploading', async () => {
  let release, ready = 0, uploads = 0
  const batch = createImportBatch(source({ download: () => new Promise(resolve => { release = () => resolve({ file, snapshot: snap(), sha256: 'a'.repeat(64) }) }) }), target({ assertReady: async () => { if (++ready > 1) throw new DriveImportError('signin') }, upload: async () => { uploads++; return media } }))
  const running = batch.run(A, [item()], signal(), () => {})
  await new Promise(resolve => setTimeout(resolve, 0))
  await assert.rejects(batch.run(A, [item()], signal(), () => {}), error('selection'))
  release(); const result = await running
  assert.equal(result[0].error, 'signin'); assert.equal(uploads, 0)
})
test('Arabic importer labels cover the complete state/error dictionary', () => {
  const en = driveLabels('en'), ar = driveLabels('ar')
  assert.deepEqual(Object.keys(ar), Object.keys(en)); for (const key of Object.keys(en)) { assert.ok(ar[key]); assert.notEqual(ar[key], en[key]) }
})
test('stalled Velo readiness is bounded and cannot start a delayed download/upload', async () => {
  let io = 0
  const batch = createImportBatch(source({ download: async () => { io++; throw new Error() } }), target({ assertReady: () => new Promise(() => {}) }), 45000, 5)
  await assert.rejects(batch.run(A, [item()], signal(), () => {}), error('signin')); assert.equal(io, 0)
})
