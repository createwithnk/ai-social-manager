import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

function harness(overrides = {}, invitation = false) {
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
  const { useAuth } = loadModule('../src/lib/auth.ts', { react, './supabase': { supabase: client, supabaseConfigurationError: null, isInvitationCallback: invitation } }, '', { window: { setTimeout, clearTimeout, location: { origin: 'https://app.example.invalid', pathname: '/' } } })
  const render = () => { cursor = 0; return useAuth() }
  return { render, calls, emit: (event, session) => callback(event, session), cleanup: () => cleanup?.(), user }
}
test('Private Beta signup never calls the public account-creation API', async () => {
  const h = harness()
  h.render()
  try {
    await Promise.resolve()
    await h.render().signUp(' test@example.invalid ', 'short')
    assert.equal(h.calls.length, 0)
    const result = await h.render().signUp(' test@example.invalid ', 'a-valid-long-password')
    assert.match(result.notice, /invite-only/)
    assert.equal(h.calls.length, 0)
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
    assert.equal(h.render().error, 'Authentication is unavailable. Please retry.')
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

test('invitation callback requires password setup before explicitly continuing', async () => {
  const h = harness({},true)
  h.render()
  try {
    assert.equal(h.render().recoveryMode,true)
    await h.render().updatePassword('a-valid-long-password')
    assert.equal(h.render().recoveryMode,true)
    h.render().exitRecovery()
    assert.equal(h.render().recoveryMode,false)
  } finally { h.cleanup() }
})

test('authentication actions suppress raw errors and use only approved error-code messages', async () => {
  for(const code of ['invalid_credentials','over_request_rate_limit','weak_password','unexpected']) {
    const error={code,message:'private-sentinel user@example.invalid token=do-not-display'}
    const h=harness({signInWithPassword:async()=>({data:{user:null},error}),resetPasswordForEmail:async()=>({error}),updateUser:async()=>({error}),signOut:async()=>({error})})
    h.render()
    try {
      for(const action of [()=>h.render().signIn('test@example.invalid','password'),()=>h.render().requestPasswordReset('test@example.invalid'),()=>h.render().updatePassword('long-valid-password'),()=>h.render().signOut()]) {
        await action()
        assert.doesNotMatch(h.render().error,/private-sentinel|user@example|token=/)
        assert.equal(h.render().loading,false)
      }
      const message=h.render().error
      assert.equal(message,code==='invalid_credentials'?'Sign-in failed. Check your email and password or try again later.':code==='over_request_rate_limit'?'Too many authentication attempts. Please wait and retry.':code==='weak_password'?'Choose a new, stronger password between 12 and 128 characters.':'Authentication is unavailable. Please retry.')
    } finally {h.cleanup()}
  }
})

test('session bootstrap errors never expose SDK details', async()=>{
  const h=harness({getSession:async()=>({data:{session:null},error:new Error('private-sentinel')})})
  h.render()
  try {await new Promise(resolve=>setImmediate(resolve));assert.equal(h.render().status,'error');assert.equal(h.render().error,'We couldn’t check your session. Check your connection and retry.')}
  finally {h.cleanup()}
})
