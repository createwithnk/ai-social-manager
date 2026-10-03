import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../supabase/functions/generate-content/handler.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { createHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const env = { ALLOWED_ORIGINS: 'https://app.example.com', SUPABASE_URL: 'https://project.example.com', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'secret', GEMINI_MODEL: 'configured-model' }
const brief = { idea: 'Teach small businesses how to plan posts', platform: 'Instagram', tone: 'Friendly' }
const request = (body = brief, headers = {}) => new Request('https://edge.example.com', { method: 'POST', headers: { origin: 'https://app.example.com', authorization: 'Bearer test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
function fixture({ auth = 200, quota = true, upstream = 200, candidate } = {}) {
  const calls = []
  const handler = createHandler({ env: (key) => env[key], fetch: async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: auth === 200 ? 'user-1' : undefined }, { status: auth })
    if (url.includes('/rpc/')) return Response.json(quota)
    return Response.json({ candidates: [candidate ?? { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ caption: 'Plan a useful post today.', hashtags: ['#Planning', 'Planning'] }) }] } }] }, { status: upstream })
  } })
  return { calls, handler }
}
test('rejects disallowed origins and missing credentials before network calls', async () => {
  const { handler, calls } = fixture()
  assert.equal((await handler(request(brief, { origin: 'https://other.example.com' }))).status, 403)
  assert.equal((await handler(request(brief, { authorization: '' }))).status, 401)
  assert.equal(calls.length, 0)
})
test('rejects expired sessions before quota or provider calls', async () => {
  const { handler, calls } = fixture({ auth: 401 })
  assert.equal((await handler(request())).status, 401)
  assert.equal(calls.length, 1)
})
test('invalid brief does not spend quota', async () => {
  const { handler, calls } = fixture()
  assert.equal((await handler(request({ ...brief, idea: 'short' }))).status, 400)
  assert.equal(calls.length, 1)
})
test('exhausted quota blocks provider calls', async () => {
  const { handler, calls } = fixture({ quota: false })
  assert.equal((await handler(request())).status, 429)
  assert.equal(calls.length, 2)
})
test('returns a normalized draft and keeps API credentials server-side', async () => {
  const { handler, calls } = fixture()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { caption: 'Plan a useful post today.', hashtags: ['Planning'] })
  assert.equal(calls[2].options.headers['x-goog-api-key'], 'secret')
  assert.equal(response.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGINS)
})
test('provider failures and safety blocks do not fall back to fake AI content', async () => {
  assert.equal((await fixture({ upstream: 500 }).handler(request())).status, 502)
  assert.equal((await fixture({ candidate: { finishReason: 'SAFETY' } }).handler(request())).status, 422)
})
test('overlength X draft rejected', async () => {
  const candidate = { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ caption: 'a'.repeat(281), hashtags: [] }) }] } }
  assert.equal((await fixture({ candidate }).handler(request({ ...brief, platform: 'X' }))).status, 422)
})
