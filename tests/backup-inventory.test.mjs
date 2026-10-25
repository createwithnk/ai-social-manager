import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { AASIFLOW_PROJECT_REF, BACKUP_INVENTORY_URL, MAX_INVENTORY_BYTES, inspectBackupInventory } from '../scripts/backup-inventory.mjs'

const token = 'synthetic-aasi-read-token'
const inventory = { walg_enabled: true, pitr_enabled: false, backups: [{ id: 1, status: 'COMPLETED', is_physical_backup: true, inserted_at: '2026-10-22T12:00:00Z' }] }
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })

test('backup inspection refuses other projects and missing/invalid credentials before any request', async () => {
  const fetchImpl = () => { assert.fail('Network must not run') }
  for (const projectRef of ['vbefjnkgrqspawerdmdv', 'another-project', '../other', '', null]) {
    const result = await inspectBackupInventory({ projectRef, token, fetchImpl })
    assert.equal(result.reason, 'project_scope_mismatch')
    assert.equal(result.inventoryVerified, false)
  }
  for (const invalid of [undefined, '', 'secret\r\nheader', 'a'.repeat(8193)]) {
    assert.equal((await inspectBackupInventory({ token: invalid, fetchImpl })).reason, 'aasi_read_token_required')
  }
})

test('only the exact AasiFlowAI GET endpoint is requested and response secrets never enter the receipt', async () => {
  const privateValue = 'DO-NOT-RETURN-THIS-PRIVATE-VALUE'
  let calls = 0
  const result = await inspectBackupInventory({ token, fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, BACKUP_INVENTORY_URL)
    assert.equal(url, `https://api.supabase.com/v1/projects/${AASIFLOW_PROJECT_REF}/database/backups`)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    assert.equal(options.body, undefined)
    return json({ ...inventory, api_key: privateValue, download_url: privateValue, backups: [{ ...inventory.backups[0], password: privateValue, signed_url: privateValue }] })
  } })
  assert.equal(calls, 1)
  assert.equal(result.status, 'observed')
  assert.equal(result.completedCount, 1)
  assert.equal(result.inventoryVerified, true)
  for (const key of ['hostedBackupVerified', 'storageObjectsVerified', 'liveChanges', 'providerCalls']) assert.equal(result[key], false, key)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes(privateValue))
  assert.ok(!serialized.includes(token))
  assert.ok(!serialized.includes('signed_url'))
})

test('empty or unfamiliar backup statuses do not certify absence of a recovery requirement', async () => {
  for (const backups of [[], [{ ...inventory.backups[0], status: 'SENSITIVE-RAW-STATUS', inserted_at: 'https://private.invalid/token' }]]) {
    const result = await inspectBackupInventory({ token, fetchImpl: async () => json({ ...inventory, backups }) })
    assert.equal(result.inventoryVerified, true)
    assert.equal(result.completedCount, 0)
    assert.equal(result.hostedBackupVerified, false)
    assert.ok(!JSON.stringify(result).includes('private.invalid'))
    assert.ok(!JSON.stringify(result).includes('SENSITIVE-RAW-STATUS'))
  }
})

test('authorization, rate-limit and server errors never retry or disclose response bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0
    const result = await inspectBackupInventory({ token, fetchImpl: async () => { calls++; return new Response('PRIVATE-ERROR-DATA', { status }) } })
    assert.equal(calls, 1)
    assert.equal(result.reason, `management_http_${status}`)
    assert.ok(!JSON.stringify(result).includes('PRIVATE-ERROR-DATA'))
  }
})

test('redirected responses and redirects are rejected without following a new destination', async () => {
  const wrong = json(inventory)
  Object.defineProperty(wrong, 'url', { value: 'https://other.invalid/backup' })
  assert.equal((await inspectBackupInventory({ token, fetchImpl: async () => wrong })).reason, 'unexpected_response_origin')
  assert.equal((await inspectBackupInventory({ token, fetchImpl: async () => Response.redirect('https://other.invalid', 302) })).reason, 'management_http_302')
})

test('oversized declared and streamed inventory responses are bounded', async () => {
  const fixtures = [
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(MAX_INVENTORY_BYTES + 1) } }),
    new Response('x'.repeat(MAX_INVENTORY_BYTES + 1), { headers: { 'content-type': 'application/json' } }),
  ]
  for (const response of fixtures) assert.equal((await inspectBackupInventory({ token, fetchImpl: async () => response })).reason, 'response_too_large')
})

test('malformed JSON, invalid schema and non-JSON responses fail with fixed messages', async () => {
  const fixtures = [new Response('PRIVATE-NOT-JSON', { headers: { 'content-type': 'application/json' } }), json({ backups: 'PRIVATE-WRONG-SHAPE' }), new Response('<html>PRIVATE-ERROR</html>')]
  for (const response of fixtures) {
    const result = await inspectBackupInventory({ token, fetchImpl: async () => response })
    assert.equal(result.status, 'blocked')
    assert.ok(!JSON.stringify(result).includes('PRIVATE-'))
  }
})

test('fetch and body stalls time out even if a transport ignores abort', async () => {
  const stalledFetch = await inspectBackupInventory({ token, timeoutMs: 15, fetchImpl: () => new Promise(() => {}) })
  assert.equal(stalledFetch.reason, 'request_timed_out')
  const stalledBody = new ReadableStream({ start() {} })
  const response = new Response(stalledBody, { headers: { 'content-type': 'application/json' } })
  const result = await inspectBackupInventory({ token, timeoutMs: 15, fetchImpl: async () => response })
  assert.equal(result.reason, 'request_timed_out')
})

test('transport exceptions are sanitized and invalid deadlines make no request', async () => {
  const result = await inspectBackupInventory({ token, fetchImpl: () => { throw new Error('PRIVATE-TOKEN-' + token) } })
  assert.equal(result.reason, 'management_request_failed')
  assert.ok(!JSON.stringify(result).includes(token))
  for (const timeoutMs of [0, -1, 10001, Infinity]) {
    assert.equal((await inspectBackupInventory({ token, timeoutMs, fetchImpl: () => assert.fail('No request') })).reason, 'invalid_deadline')
  }
})

test('the command ignores unrelated Supabase keys and never asks for credentials on stdin', () => {
  const result = spawnSync(process.execPath, ['scripts/backup-inventory.mjs'], {
    env: { PATH: process.env.PATH, SUPABASE_ACCESS_TOKEN: 'UNRELATED-PROJECT-SECRET', SUPABASE_SERVICE_ROLE_KEY: 'UNRELATED-SERVER-SECRET' },
    encoding: 'utf8', timeout: 5000,
  })
  assert.equal(result.status, 2)
  const report = JSON.parse(result.stdout)
  assert.equal(report.reason, 'aasi_read_token_required')
  assert.ok(!result.stdout.includes('UNRELATED-'))
})
