import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'
import { matchesMediaHeader, mediaFormats } from '../supabase/functions/_shared/media-validation.ts'

const user = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'private-name.png', { type: 'image/png' })
function setup(overrides = {}) {
  const calls = []
  const bucket = {
    upload: async (...args) => { calls.push(['upload', ...args]); return { error: null } },
    remove: async (...args) => { calls.push(['remove', ...args]); return { error: null } },
    list: async () => ({ data: [{ id: 'id', name: user, metadata: { mimetype: 'image/png', size: 9 } }], error: null }),
    createSignedUrl: async (path, expires) => { calls.push(['sign', path, expires]); return { data: { signedUrl: 'https://private.example.invalid/preview' }, error: null } },
    ...overrides.bucket,
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: overrides.userId ?? user } }, error: null }) }, rpc: async () => ({ data: overrides.active !== false, error: null }), storage: { from: name => { assert.equal(name, 'post-media'); return bucket } }, functions: { invoke: async (name, options) => { calls.push(['invoke', name, options]); return { data: { path: `${user}/opaque.png` }, error: overrides.invokeError ?? null } } } }
  if (overrides.invokeError) bucket.upload = async () => ({ error: overrides.invokeError })
  return { ...loadModule('../src/lib/media.ts', { './supabase': { supabase: client }, './beta-policy': { betaUploadsEnabled: overrides.uploads !== false, betaUploadNotice: 'Uploads are paused for the Private Beta safety review.' }, './monitoring': { reportRuntimeError: async () => {} }, '../../supabase/functions/_shared/media-validation': { matchesMediaHeader, mediaFormats } }, '', { File }), calls }
}
test('media validates size, MIME and file signature before uploads', async () => {
  const { validateMedia } = setup()
  assert.equal(await validateMedia(png), 'png')
  await assert.rejects(validateMedia(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })))
  await assert.rejects(validateMedia(new File(['html'], 'x.png', { type: 'image/png' })))
  await assert.rejects(validateMedia({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }))
  await assert.rejects(validateMedia({ type: 'video/mp4', size: 50 * 1024 * 1024 + 1 }))
  await assert.rejects(validateMedia(new File([], 'empty.png', { type: 'image/png' })))
})

test('Private Beta blocks new uploads before authentication or storage calls', async () => {
  const { uploadMedia, calls } = setup({ uploads: false })
  await assert.rejects(uploadMedia(user,png), /paused/)
  assert.equal(calls.length,0)
})
test('uploads reuse private post-media storage with opaque owner paths and no upsert', async () => {
  const { uploadMedia, calls } = setup()
  await uploadMedia(user, png)
  assert.equal(calls[0][0], 'upload')
  assert.equal(calls[0][1], `${user}/test-post-id`)
  assert.equal(calls[0][3].contentType, 'image/png')
  assert.equal(calls[0][3].upsert, false)
  assert.equal(calls.some((call) => call[0] === 'invoke'), false)
})
test('expired/mismatched sessions and cross-owner deletion never reach storage', async () => {
  const { uploadMedia, deleteMedia, calls } = setup({ userId: other })
  await assert.rejects(uploadMedia(user, png))
  await assert.rejects(deleteMedia(user, `${other}/photo.png`))
  await assert.rejects(deleteMedia(user, `${user}/../photo.png`))
  assert.equal(calls.length, 0)
})
test('private previews use expiring signed URLs and storage failures are sanitized', async () => {
  const { listMedia, calls } = setup()
  assert.equal((await listMedia(user)).length, 1)
  assert.equal(calls[0][2], 300)
  const failing = setup({ invokeError: new Error('private-storage-detail') })
  await assert.rejects(failing.uploadMedia(user, png), (error) => !error.message.includes('private-storage-detail'))
})

test('revoked sessions cannot list or upload private media', async () => {
  const { uploadMedia, listMedia, calls } = setup({ active: false })
  await assert.rejects(uploadMedia(user, png))
  await assert.rejects(listMedia(user))
  assert.equal(calls.length, 0)
})
