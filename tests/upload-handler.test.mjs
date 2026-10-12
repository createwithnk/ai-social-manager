import test from 'node:test'
import assert from 'node:assert/strict'
import { createUploadHandler } from '../supabase/functions/upload-media/handler.ts'

const user = 'verified-user'
const png = new Uint8Array([137,80,78,71,13,10,26,10,0])
function setup(overrides = {}) {
  const calls = []
  const handler = createUploadHandler({
    env: () => 'http://localhost:5173', authenticate: async (token) => token === 'valid-token' ? user : null,
    reserve: async (...args) => { calls.push(['reserve', ...args]); return { id: 'reservation-id', path: `${user}/opaque.png` } },
    upload: async (...args) => { calls.push(['upload', ...args]) },
    finish: async (...args) => { calls.push(['finish', ...args]) },
    ...overrides,
  })
  const request = (body = png, headers = {}) => handler(new Request('https://example.invalid', { method: 'POST', headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'image/png', ...headers }, body }))
  return { handler, request, calls }
}
test('upload authentication, CORS, MIME and signature failures never reserve or store bytes', async () => {
  const { request, calls, handler } = setup()
  assert.equal((await request(png, { Authorization: '' })).status, 401)
  assert.equal((await request(png, { Authorization: 'Bearer expired-token' })).status, 401)
  assert.equal((await request(png, { Origin: 'https://evil.invalid' })).status, 403)
  assert.equal((await request(png, { 'Content-Type': 'image/svg+xml' })).status, 415)
  assert.equal((await request(png, { 'Content-Type': 'constructor' })).status, 415)
  assert.equal((await request(new TextEncoder().encode('<html>'))).status, 415)
  assert.equal((await request(new Uint8Array())).status, 400)
  const preflight = await handler(new Request('https://example.invalid', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }))
  assert.equal(preflight.status, 204)
  assert.equal(calls.length, 0)
})
test('upload bounds actual bytes and declared size; body-read timeout is handled', async () => {
  const { request, calls } = setup()
  assert.equal((await request(png, { 'Content-Length': '10485761' })).status, 413)
  assert.equal((await request(new Uint8Array(10485761))).status, 413)
  assert.equal(calls.length, 0)
  const stalled = new ReadableStream({ start: () => {} })
  const { handler } = setup({ readTimeoutMs: 5 })
  const result = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'image/png' }, body: stalled, duplex: 'half' }))
  assert.equal(result.status, 408)
})
test('successful uploads reserve verified owner capacity and finalize server tracking', async () => {
  const { request, calls } = setup()
  const result = await request()
  assert.equal(result.status, 201)
  assert.deepEqual(await result.json(), { path: `${user}/opaque.png` })
  assert.deepEqual(calls[0], ['reserve', user, png.byteLength, 'png'])
  assert.equal(calls[1][0], 'upload')
  assert.deepEqual(calls[2], ['finish', 'reservation-id', true])
})
test('quota denial, adapter failures and cross-owner paths fail closed', async () => {
  for (const [reserve, status] of [[async () => null, 429], [async () => { throw new Error('private-key') }, 503], [async () => ({ id: 'id', path: 'other-user/asset.png' }), 503]]) {
    const { request, calls } = setup({ reserve })
    const result = await request()
    assert.equal(result.status, status)
    assert.equal(calls.some((call) => call[0] === 'upload'), false)
    assert.doesNotMatch(await result.text(), /private-key/)
  }
})
test('failed storage upload finalizes a failed reservation and sanitizes details', async () => {
  const { request, calls } = setup({ upload: async () => { throw new Error('private-storage-detail') } })
  const result = await request()
  assert.equal(result.status, 502)
  assert.deepEqual(calls.at(-1), ['finish', 'reservation-id', false])
  assert.doesNotMatch(await result.text(), /private-storage-detail/)
})
