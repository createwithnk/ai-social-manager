import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaSignatureMatches } from '../supabase/functions/_shared/media-signature.ts'
import { loadModule } from './helpers.mjs'

test('Edge adapter requires a verified nonanonymous user and uses the caller session for existing quota and revoked-session RPCs', async () => {
  for (const user of [null, { id: 'id', is_anonymous: true, email_confirmed_at: '2026-01-01' }, { id: 'id', is_anonymous: false }, { id: 'verified-id', is_anonymous: false, email_confirmed_at: '2026-01-01' }]) {
    let dependencies
    const calls = []
    const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'fake-public-key' }
    loadModule('../supabase/functions/generate-content/index.ts', {
      'npm:@supabase/supabase-js@2.112.4': { createClient: (_url, key) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, payload) => { calls.push({ name, payload, key }); return { data: true, error: null } } }) },
      '../_shared/media-signature.ts': { mediaSignatureMatches },
      './handler.ts': { createHandler: (value) => { dependencies = value; return () => {} } },
    }, '', { Deno: { env: { get: (name) => env[name] }, serve: () => {} }, fetch, AbortSignal })
    assert.equal(await dependencies.authenticate(env.SUPABASE_URL, 'fake-public-key', 'fake-user-token'), user?.id === 'verified-id' ? 'verified-id' : null)
    if (user?.id === 'verified-id') {
      assert.equal(await dependencies.consumeCredit(user.id, 'fake-user-token'), true)
      assert.equal(calls[0].name, 'has_active_session')
      assert.equal(calls[1].name, 'consume_ai_quota')
      assert.equal(calls[1].key, 'fake-public-key')
      assert.equal(calls[1].payload, undefined)
    }
  }
})

test('revoked sessions and session-security failures stop the AI adapter', async () => {
  for (const failure of [false, true]) {
    let dependencies
    loadModule('../supabase/functions/generate-content/index.ts', {
      'npm:@supabase/supabase-js@2.112.4': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'verified-id', email_confirmed_at: '2026-01-01' } }, error: null }) }, rpc: async () => ({ data: false, error: failure ? new Error('mock-unavailable') : null }) }) },
      '../_shared/media-signature.ts': { mediaSignatureMatches },
      './handler.ts': { createHandler: value => { dependencies = value; return () => {} } },
    }, '', { Deno: { env: { get: () => '' }, serve: () => {} }, fetch, AbortSignal })
    if (failure) await assert.rejects(dependencies.authenticate('https://example.invalid','public-key','mock-token'))
    else assert.equal(await dependencies.authenticate('https://example.invalid','public-key','mock-token'), null)
  }
})
