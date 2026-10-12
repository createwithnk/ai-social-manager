import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers.mjs'

test('existing scheduled posts use owner-scoped UPDATE and new drafts use INSERT', async () => {
  for (const exists of [true, false]) {
    const calls = []
    const userId = 'user-a'
    const post = { id: 'post-id', idea: 'A useful idea', platform: 'Instagram', tone: 'Friendly', caption: 'Caption', hashtags: ['A', 'B', 'C'], status: exists ? 'scheduled' : 'draft', createdAt: '2026-10-12', scheduledFor: exists ? '2099-01-01' : undefined, approvedBy: 'forged-identity', revision: exists ? 1 : undefined }
    const row = { id: post.id, user_id: userId, ...post, created_at: post.createdAt, scheduled_for: post.scheduledFor, language: 'English', revision: 2, media: null, approved_at: null, approved_by: userId }
    const chain = { select: () => chain, eq: (...args) => { calls.push(['eq', ...args]); return chain }, maybeSingle: async () => ({ data: calls.some(call => ['update','insert'].includes(call[0])) ? row : exists ? { id: post.id } : null, error: null }) }
    const table = { ...chain, update: (payload) => { calls.push(['update', payload]); return chain }, insert: (payload) => { calls.push(['insert', payload]); return chain } }
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) }, from: () => table }
    const { savePostForUser } = loadModule('../src/lib/posts.ts', { './supabase': { supabase } })
    await savePostForUser(post, userId)
    const write = calls.find((call) => call[0] === (exists ? 'update' : 'insert'))
    assert.ok(write)
    assert.equal('approved_by' in write[1], false)
    assert.equal(write[1].language, 'English')
    assert.equal('market' in write[1], false)
    if (exists) assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'revision' && call[2] === 1))
    assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === userId))
  }
})

test('existing posts without a reviewed revision cannot be overwritten', async () => {
  let writes=0
  const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{id:'post-id'},error:null}),update:()=>{writes++;return chain}}
  const client={auth:{getUser:async()=>({data:{user:{id:'user-a'}},error:null})},from:()=>chain}
  const {savePostForUser}=loadModule('../src/lib/posts.ts',{'./supabase':{supabase:client}})
  await assert.rejects(savePostForUser({id:'post-id',language:'en'},'user-a'),/Refresh and review/)
  assert.equal(writes,0)
})

test('a revision conflict returns an actionable error instead of a successful save', async () => {
  let updating = false
  const chain = { select: () => chain, eq: () => chain, update: () => { updating = true; return chain }, maybeSingle: async () => ({ data: updating ? null : { id: 'post-id' }, error: null }) }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) }, from: () => chain }
  const { savePostForUser } = loadModule('../src/lib/posts.ts', { './supabase': { supabase: client } })
  await assert.rejects(savePostForUser({ id: 'post-id', language: 'en', revision: 1 }, 'user-a'), /changed on another device/)
})
