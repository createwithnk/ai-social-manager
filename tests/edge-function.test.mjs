import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../supabase/functions/generate-content/handler.ts'

const brief = { idea: 'Help small businesses create better posts', platform: 'Instagram', tone: 'Friendly' }
const draft = { caption: 'An editable caption. What would you add?', hashtags: ['Business', 'Tips', 'Growth'] }
const provider = (value = draft, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })
function setup(overrides = {}) {
  const calls = []
  const env = { ALLOWED_ORIGINS: 'http://localhost:5173', SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-public-key', GEMINI_API_KEY: 'test-secret-sentinel', ...overrides.env }
  const handler = createHandler({ env: (name) => env[name], authenticate: overrides.authenticate ?? (async (_url, _key, token) => token === 'valid-token'), fetch: async (url, options) => { calls.push({ url, options }); return overrides.fetch ? overrides.fetch(url, options) : provider() }, timeoutMs: overrides.timeoutMs })
  const request = (body = brief, options = {}) => handler(new Request('https://example.invalid/generate', { method: 'POST', headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json', ...options.headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...options.init }))
  return { handler, request, calls }
}

test('CORS preflight allows exact trusted origins without authenticating', async () => {
  const { handler, calls } = setup({ authenticate: async () => { throw new Error('Must not authenticate preflight') } })
  const result = await handler(new Request('https://example.invalid', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }))
  assert.equal(result.status, 204)
  assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(result.headers.get('vary'), 'Origin')
  assert.match(result.headers.get('access-control-allow-headers'), /authorization/)
  assert.equal(calls.length, 0)
})
test('CORS rejects untrusted, null, lookalike and unconfigured origins', async () => {
  for (const origin of ['https://evil.invalid', 'null', 'http://localhost:5173.evil.invalid']) {
    const { handler, request, calls } = setup()
    assert.equal((await request(brief, { headers: { Origin: origin } })).status, 403)
    const preflight = await handler(new Request('https://example.invalid', { method: 'OPTIONS', headers: { Origin: origin } }))
    assert.equal(preflight.status, 403)
    assert.equal(preflight.headers.get('access-control-allow-origin'), null)
    assert.equal(calls.length, 0)
  }
  assert.equal((await setup({ env: { ALLOWED_ORIGINS: '' } }).request()).status, 403)
})
test('rejects unsupported methods and content types', async () => {
  const { handler, request } = setup()
  assert.equal((await handler(new Request('https://example.invalid', { method: 'GET' }))).status, 405)
  assert.equal((await request(brief, { headers: { 'Content-Type': 'text/plain' } })).status, 415)
})
test('authentication rejects missing, empty, malformed, expired and anonymous tokens before provider calls', async () => {
  for (const authorization of ['', 'Bearer ', 'Basic valid-token', 'Bearer expired-token', 'Bearer public-anon-key', 'Bearer valid-token extra']) {
    const { request, calls } = setup()
    const result = await request(brief, { headers: { Authorization: authorization } })
    assert.equal(result.status, 401)
    assert.equal(calls.length, 0)
  }
  assert.equal((await setup({ env: { GEMINI_API_KEY: undefined } }).request(brief, { headers: { Authorization: 'Bearer expired-token' } })).status, 401)
})
test('authentication exceptions and missing configuration return safe errors', async () => {
  for (const overrides of [{ authenticate: async () => { throw new Error('test-secret-sentinel') } }, { env: { SUPABASE_URL: undefined } }, { env: { GEMINI_API_KEY: undefined } }, { env: { GEMINI_MODEL: '../invalid' } }]) {
    const { request, calls } = setup(overrides)
    const result = await request()
    assert.equal(result.status, 503)
    assert.doesNotMatch(await result.text(), /test-secret-sentinel/)
    assert.equal(calls.length, 0)
  }
})
test('invalid JSON, primitives, arrays, short/long ideas and unknown choices never reach Gemini', async () => {
  for (const body of ['{', null, [], 42, { ...brief, idea: 'short' }, { ...brief, idea: ' '.repeat(10) }, { ...brief, idea: 'x'.repeat(501) }, { ...brief, platform: ['Instagram'] }, { ...brief, tone: 'Unknown' }]) {
    const { request, calls } = setup()
    assert.equal((await request(body)).status, 400)
    assert.equal(calls.length, 0)
  }
})
test('limits actual streamed body size as well as content-length', async () => {
  const { request, calls } = setup()
  assert.equal((await request(' '.repeat(8193))).status, 413)
  assert.equal((await request(brief, { headers: { 'Content-Length': '9000' } })).status, 413)
  assert.equal(calls.length, 0)
})
test('valid generation returns only an editable draft, with secret confined to provider header', async () => {
  const { request, calls } = setup()
  const result = await request()
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), draft)
  assert.equal(result.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-secret-sentinel')
  assert.doesNotMatch(calls[0].url + calls[0].options.body, /test-secret-sentinel|valid-token/)
  assert.equal(JSON.parse(calls[0].options.body).generationConfig.responseFormat.text.schema.type, 'object')
})
test('provider HTTP, network, JSON, schema and incomplete response errors are sanitized', async () => {
  const failures = [
    async () => new Response('test-secret-sentinel', { status: 429 }),
    async () => { throw new Error('test-secret-sentinel') },
    async () => new Response('invalid json'),
    async () => Response.json({ candidates: {} }),
    async () => provider(draft, 'MAX_TOKENS'),
    async () => provider({ ...draft, caption: ' ' }),
    async () => provider({ ...draft, caption: 'x'.repeat(1501) }),
    async () => provider({ ...draft, hashtags: [] }),
    async () => provider({ ...draft, hashtags: ['A', 'A', 'B'] }),
    async () => provider({ ...draft, hashtags: ['#Bad', 'B', 'C'] }),
  ]
  for (const fetch of failures) {
    const result = await setup({ fetch }).request()
    assert.equal(result.status, 502)
    assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.doesNotMatch(await result.text(), /test-secret-sentinel/)
  }
})
test('timeout stays active while reading provider body', async () => {
  const result = await setup({ timeoutMs: 5, fetch: async (_url, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) }) }).request()
  assert.equal(result.status, 502)
})
