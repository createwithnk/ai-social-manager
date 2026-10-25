// Entirely in-memory, synthetic Auth catalog; never connects to hosted Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('review-only asset proposal preserves the core and enforces isolated OAuth/refresh contracts', async t => {
  const db = new PGlite()
  const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222'
  const SA = 'a3333333-3333-4333-8333-333333333333', SB = 'b4444444-4444-4444-8444-444444444444'
  let count = 0
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const role = async name => { await db.exec('reset role'); if (name !== 'postgres') await db.exec(`set role ${name}`) }
  const call = (op, p = {}, uid = A, sid = SA) => scalar('select public.velo_asset_command($1,$2,$3,$4::jsonb)', [op, uid, sid, JSON.stringify(p)])
  const begin = async (provider = 'canva', uid = A, sid = SA) => {
    const stateHash = (++count).toString(16).padStart(64, '0')
    return { ...await call('begin', { provider, stateHash, encryptedVerifier: 'v1.' + 'x'.repeat(80) }, uid, sid), stateHash, provider }
  }
  const take = flow => call('take', { stateHash: flow.stateHash }, null, null)
  const payload = flow => ({ id: flow.id, generation: flow.generation, provider: flow.provider, encryptedGrant: 'v1.' + 'y'.repeat(100), accountId: 'account_fixture', accountName: 'Fixture owner', expiresAt: Date.now() + 3600000 })
  const connect = async (provider = 'canva', uid = A, sid = SA) => { const flow = await begin(provider, uid, sid); assert.ok((await take(flow))?.id); assert.equal(await call('save', payload(flow), uid, sid), true); return flow }
  try {
    await db.exec(await readFile('tests/local-bootstrap.sql', 'utf8'))
    for (const file of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
    await db.query('insert into auth.users(id) values($1),($2)', [A, B])
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [SA, A, SB, B])
    await db.query("insert into public.posts(user_id,idea,platform,tone,caption,status) values($1,'Existing post','Instagram','Friendly','Keep this caption','draft')", [A])
    await db.exec(await readFile('supabase/proposals/20261015000000_private_beta_safety.sql', 'utf8'))
    const coreBefore = await scalar("select jsonb_agg(to_jsonb(p)) from public.posts p")
    const policiesBefore = (await db.query("select * from pg_policies where schemaname in ('public','storage','auth') order by schemaname,tablename,policyname")).rows
    const functionsBefore = (await db.query("select p.oid,md5(pg_get_functiondef(p.oid)) as hash from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname in ('public','private','auth','storage') and p.prokind='f' order by p.oid")).rows
    await db.exec(await readFile('supabase/proposals/velo_asset_connections.sql', 'utf8'))

    await t.test('new tables are RLS-closed and neither clients nor service can read ciphertext directly', async () => {
      assert.equal(await scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'velo_asset_%' and c.relkind='r' and c.relrowsecurity"), 4)
      for (const name of ['anon', 'authenticated', 'service_role']) {
        await role(name)
        for (const table of ['controls', 'connections', 'states', 'daily']) await assert.rejects(db.query(`select * from private.velo_asset_${table}`))
        if (name !== 'service_role') await assert.rejects(call('list'))
        await assert.rejects(db.query('select private.velo_asset_allowed($1,$2)', [A, SA]))
      }
      await role('service_role')
      assert.equal(await call('begin', { provider: 'canva', stateHash: 'a'.repeat(64), encryptedVerifier: 'x'.repeat(80) }), null)
      assert.deepEqual(await call('list'), { enabled: false, connections: [] })
    })
    await role('postgres')
    await db.query("insert into private.beta_members(user_id,expires_at) values($1,now()+interval '1 day'),($2,now()+interval '1 day')", [A, B])
    await db.exec('update private.velo_asset_controls set enabled=true')
    await role('service_role')

    await t.test('OAuth state is one-use, owner-bound, short-lived and superseded by a newer flow', async () => {
      const old = await begin(), current = await begin()
      assert.equal(await take(old), null)
      const record = await take(current)
      assert.equal(record.userId, A); assert.equal(record.sessionId, SA); assert.equal(record.generation, current.generation)
      assert.equal(await take(current), null)
      assert.equal(await call('save', payload(old)), null)
      assert.equal(await call('save', payload(current), B, SB), null)
      assert.equal(await call('save', payload(current)), true)
      assert.equal(await call('save', payload(current)), null)
      const expired = await begin('drive')
      await role('postgres'); await db.query("update private.velo_asset_states set expires_at=now()-interval '1 second' where state_hash=$1", [expired.stateHash]); await role('service_role')
      assert.equal(await take(expired), null)
    })

    await t.test('pending flow and per-day limits prevent unbounded provider authorization', async () => {
      const flows = [await begin('drive'), await begin('drive'), await begin('drive')]
      const rejected = await begin('drive'); assert.equal(rejected.id, undefined)
      for (const flow of flows) await take(flow)
      await role('postgres'); await db.query('update private.velo_asset_daily set oauth_calls=10 where user_id=$1', [A]); await role('service_role')
      assert.equal((await begin()).id, undefined)
      await role('postgres'); await db.query('update private.velo_asset_daily set oauth_calls=0 where user_id=$1', [A]); await role('service_role')
    })

    await t.test('revoked/expired membership and removed/expired sessions invalidate callbacks', async () => {
      for (const statement of ["update private.beta_members set revoked=true where user_id=$1", "update private.beta_members set expires_at=now()-interval '1 second' where user_id=$1", "update auth.sessions set not_after=now()-interval '1 second' where user_id=$1", "delete from auth.sessions where user_id=$1"]) {
        const flow = await begin('drive')
        await role('postgres'); await db.query(statement, [A]); await role('service_role')
        assert.equal(await take(flow), null)
        assert.equal(await call('save', payload(flow)), null)
        await role('postgres'); await db.query("update private.beta_members set revoked=false,expires_at=now()+interval '1 day' where user_id=$1", [A]); await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict(id) do update set not_after=null', [SA, A]); await role('service_role')
      }
      assert.equal(await call('list', {}, A, SB), null)
    })

    await t.test('metadata leases serialize refreshes and are never stolen after an uncertain outcome', async () => {
      const flow = await connect()
      const claim = await call('claim', { provider: 'canva' })
      assert.ok(claim.lease); assert.ok(claim.encryptedGrant)
      assert.equal(await call('claim', { provider: 'canva' }), null)
      assert.equal(await call('finish', { ...payload(flow), lease: SB }), null)
      assert.equal(await call('finish', { ...payload(flow), lease: claim.lease }, B, SB), null)
      assert.equal((await call('list')).connections.find(value => value.provider === 'canva').status, 'reconnect')
      // Starting a new OAuth generation is the only way out of a lost lease.
      const newer = await connect()
      assert.equal(await call('finish', { ...payload(flow), lease: claim.lease }), null)
      const currentClaim = await call('claim', { provider: 'canva' })
      assert.equal(await call('finish', { ...payload(newer), lease: currentClaim.lease, accountId: 'switched_account' }), null)
      assert.equal(await call('finish', { ...payload(newer), lease: currentClaim.lease }), true)
      const another = await call('claim', { provider: 'canva' })
      assert.equal(await call('finish', { ...payload(newer), lease: another.lease, failed: true }), true)
      assert.equal(await call('claim', { provider: 'canva' }), null)
    })

    await t.test('read budgets are bounded and a disconnected owner cannot finish an old provider request', async () => {
      const flow = await connect('drive')
      await role('postgres'); await db.query('update private.velo_asset_daily set read_calls=100 where user_id=$1', [A]); await role('service_role')
      assert.equal(await call('claim', { provider: 'drive' }), null)
      await role('postgres'); await db.query('update private.velo_asset_daily set read_calls=0 where user_id=$1', [A]); await role('service_role')
      const claim = await call('claim', { provider: 'drive' })
      assert.equal(await call('disconnect', { provider: 'drive' }), true)
      assert.equal(await call('finish', { ...payload(flow), lease: claim.lease }), null)
      assert.equal(await call('claim', { provider: 'drive' }), null)
    })

    await t.test('owner isolation and disconnect survive a disabled gate without deleting assets or core records', async () => {
      await connect('drive', B, SB)
      assert.equal((await call('list', {}, B, SB)).connections.length, 1)
      const beforeB = (await call('list', {}, B, SB)).connections
      await role('postgres'); await db.exec(await readFile('supabase/proposals/velo_asset_connections.pause.sql', 'utf8')); await role('service_role')
      assert.equal(await call('disconnect', { provider: 'drive' }), true)
      assert.deepEqual((await call('list', {}, B, SB)).connections, beforeB)
      assert.equal(await call('claim', { provider: 'drive' }, B, SB), null)
      assert.equal(await call('disconnect', { provider: 'drive' }, B, SB), true)
      await role('postgres')
      assert.equal(await scalar('select count(*)::int from private.velo_asset_connections where encrypted_grant is not null and provider=\'drive\''), 0)
      assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(p)) from public.posts p'), coreBefore)
      assert.deepEqual((await db.query("select * from pg_policies where schemaname in ('public','storage','auth') order by schemaname,tablename,policyname")).rows, policiesBefore)
      for (const fn of functionsBefore) assert.equal(await scalar('select md5(pg_get_functiondef($1::oid))', [fn.oid]), fn.hash)
      assert.equal(await scalar('select publishing_enabled or billing_enabled from private.launch_controls'), false)
    })
  } finally { await db.close() }
})
