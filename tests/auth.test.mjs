import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

function harness(overrides = {}) {
  const states = []
  let cursor = 0
  let callback
  let cleanup
  let mounted = false
  const calls = []
  const user = { id: 'user-a' }
  const client = { auth: {
    getSession: async () => ({ data: { session: { user } }, error: null }),
    onAuthStateChange: (fn) => { callback = fn; return { data: { subscription: { unsubscribe: () => calls.push('unsubscribe') } } } },
    signUp: async (input) => { calls.push(input); return { data: { session: null, user }, error: null } },
    updateUser: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  } }
  const react = {
    useState: (initial) => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    useCallback: (fn) => fn,
    useEffect: (fn) => { if (!mounted) { cleanup = fn(); mounted = true } },
  }
  const { useAuth } = loadModule('../src/lib/auth.ts', { react, './supabase': { supabase: client, supabaseConfigurationError: null } }, '', { window: { setTimeout, clearTimeout, location: { origin: 'https://app.example.invalid', pathname: '/' } } })
  const render = () => { cursor = 0; return useAuth() }
  return { render, calls, emit: (event, session) => callback(event, session), cleanup: () => cleanup?.(), user }
}
test('signup validates passwords before the API and requires email confirmation without a session', async () => {
  const h = harness()
  h.render()
  try {
    await Promise.resolve()
    await h.render().signUp(' test@example.invalid ', 'short')
    assert.equal(h.calls.length, 0)
    assert.match(h.render().error, /12 and 128/)
    const result = await h.render().signUp(' test@example.invalid ', 'a-valid-long-password')
    assert.match(result.notice, /confirm/)
    assert.equal(h.render().status, 'unauthenticated')
    assert.equal(h.calls[0].email, 'test@example.invalid')
  } finally { h.cleanup() }
})
test('password recovery remains visible until explicitly continued and logout clears recovery', async () => {
  const h = harness()
  h.render()
  try {
    h.emit('PASSWORD_RECOVERY', { user: h.user })
    assert.equal(h.render().recoveryMode, true)
    await h.render().updatePassword('a-valid-long-password')
    assert.equal(h.render().recoveryMode, true)
    h.render().exitRecovery()
    assert.equal(h.render().recoveryMode, false)
    h.emit('PASSWORD_RECOVERY', { user: h.user })
    h.emit('SIGNED_OUT', null)
    assert.equal(h.render().recoveryMode, false)
    assert.equal(h.render().user, null)
  } finally { h.cleanup() }
})
test('network failures during logout retain the user and present an error', async () => {
  const h = harness({ signOut: async () => { throw new Error('Connection unavailable') } })
  h.render()
  try {
    h.emit('SIGNED_IN', { user: h.user })
    await h.render().signOut()
    assert.equal(h.render().status, 'authenticated')
    assert.equal(h.render().user.id, h.user.id)
    assert.match(h.render().error, /Connection unavailable/)
    assert.equal(h.render().loading, false)
  } finally { h.cleanup() }
})
test('late recovery callbacks after unmount do not change state', () => {
  const h = harness()
  h.render()
  h.cleanup()
  h.emit('PASSWORD_RECOVERY', { user: h.user })
  assert.equal(h.render().recoveryMode, false)
  assert.equal(h.calls[0], 'unsubscribe')
})
