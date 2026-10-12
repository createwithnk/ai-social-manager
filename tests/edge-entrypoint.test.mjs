import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

test('Edge adapter requires a verified nonanonymous user and uses server credentials only for usage RPC', async () => {
  for (const user of [null, { id: 'id', is_anonymous: true, email_confirmed_at: '2026-01-01' }, { id: 'id', is_anonymous: false }, { id: 'verified-id', is_anonymous: false, email_confirmed_at: '2026-01-01' }]) {
    let dependencies
    const calls = []
    const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-server-sentinel' }
    loadModule('../supabase/functions/generate-content/index.ts', {
      'npm:@supabase/supabase-js@2.112.4': { createClient: (_url, key) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, payload) => { calls.push({ name, payload, key }); return { data: true, error: null } } }) },
      './handler.ts': { createHandler: (value) => { dependencies = value; return () => {} } },
    }, '', { Deno: { env: { get: (name) => env[name] }, serve: () => {} }, fetch, AbortSignal })
    assert.equal(await dependencies.authenticate(env.SUPABASE_URL, 'fake-public-key', 'fake-user-token'), user?.id === 'verified-id' ? 'verified-id' : null)
    if (user?.id === 'verified-id') {
      assert.equal(await dependencies.consumeCredit(user.id), true)
      assert.equal(calls[0].key, 'fake-server-sentinel')
      assert.equal(calls[0].payload.p_user_id, user.id)
      assert.equal(calls[0].name, 'consume_ai_credit')
    }
  }
})
