// Isolated native PostgreSQL acceptance. Never uses a database URL or live credentials.
// Auth/Storage catalogs are synthetic; this is NOT a hosted backup/restore certificate.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chown, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { isolatedPgEnvironment } from './native-pg-environment.mjs'

const bin = process.env.AASIFLOW_TEST_PG_BIN
if (!bin || !path.isAbsolute(bin)) throw new Error('Set AASIFLOW_TEST_PG_BIN to an absolute PostgreSQL 17 bin directory. No download or hosted fallback is performed.')
if (process.platform === 'win32') throw new Error('This socket-only native check requires Linux/macOS/WSL. It does not connect to a Windows or hosted database.')
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await mkdtemp(path.join(os.tmpdir(), 'aasiflow-beta-native-'))
const data = path.join(directory, 'data')
const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {}
const clients = new Set()
const report = { checkedAt: new Date().toISOString(), status: 'blocked', scope: 'Disposable socket-only native PostgreSQL with synthetic Auth/Storage', checks: [], sourceHashes: [], stopped: false, syntheticLogicalRestoreVerified: false, hostedBackupVerified: false, liveChanges: false, providerCalls: false }
const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222'
const SA = 'a3333333-3333-4333-8333-333333333333', SB = 'b4444444-4444-4444-8444-444444444444'
let server, serverLog = '', admin

function run(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(bin, name), args, {
      ...identity, cwd: directory, stdio: ['ignore', 'pipe', 'pipe'],
      env: isolatedPgEnvironment(process.env, directory),
    })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 30000)
    child.stdout.on('data', bytes => { output += bytes })
    child.stderr.on('data', bytes => { output += bytes })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`${name} failed (${code}): ${output.slice(-1200)}`)) })
  })
}

async function connect(role = 'postgres', uid, session, database = 'postgres') {
  assert.ok(['postgres', 'authenticated', 'service_role', 'anon'].includes(role))
  assert.ok(['postgres', 'aasiflow_beta_restore'].includes(database))
  // Explicit socket/user/database. PGHOST, DATABASE_URL and saved Supabase settings are ignored.
  const client = new pg.Client({ host: directory, port: 5432, database, user: 'postgres', password: '', ssl: false, connectionTimeoutMillis: 2000, query_timeout: 10000, options: '-c statement_timeout=8000 -c lock_timeout=5000' })
  client.on('error', () => {})
  try { await client.connect() } catch (error) { await client.end().catch(() => {}); throw error }
  clients.add(client)
  await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: uid, session_id: session, user_metadata: { admin: true, beta: true } })])
  if (role !== 'postgres') await client.query(`set role ${role}`)
  return client
}
async function scalar(client, sql, args = []) { return Object.values((await client.query(sql, args)).rows[0])[0] }
async function source(relative, expectedHash) {
  const sql = (await readFile(path.join(root, relative), 'utf8')).replace(/\r\n/g, '\n')
  const sha256 = createHash('sha256').update(sql).digest('hex')
  if (expectedHash) assert.equal(sha256, expectedHash, relative)
  report.sourceHashes.push({ path: relative, sha256 })
  return sql
}
async function check(name, fn) {
  await fn()
  report.checks.push(name)
  process.stdout.write(`PASS: ${name}\n`)
}

async function restoreSnapshot(client) {
  const rows = {}
  for (const table of ['auth.users', 'auth.sessions', 'public.posts', 'public.ai_usage', 'storage.objects', 'private.beta_members', 'private.beta_controls', 'private.ai_requests', 'private.client_error_counts', 'private.launch_controls']) {
    rows[table] = await scalar(client, `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table} t`)
  }
  const policies = (await client.query("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','private','storage','auth') order by schemaname,tablename,policyname")).rows
  const rls = (await client.query("select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','storage','auth') order by n.nspname,c.relname")).rows
  const functions = (await client.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,md5(pg_get_functiondef(p.oid)) as body_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ('public','private','storage','auth') order by n.nspname,p.proname,args")).rows
  return { rows, policies, rls, functions }
}

try {
  if (identity.uid !== undefined) {
    try { await chown(directory, identity.uid, identity.gid) } catch {
      throw new Error('This filesystem cannot provision an unprivileged PostgreSQL cluster. Native acceptance is blocked; no root-check bypass or hosted fallback is allowed.')
    }
  }
  report.version = (await run('postgres', ['--version'])).trim()
  assert.match(report.version, /PostgreSQL\) 17\./)
  for (const tool of ['pg_dump', 'pg_dumpall', 'pg_restore']) assert.match(await run(tool, ['--version']), /PostgreSQL\) 17\./)
  await run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8', '--no-sync'])
  server = spawn(path.join(bin, 'postgres'), ['-D', data, '-k', directory, '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700', '-c', 'max_connections=32', '-c', 'log_min_messages=error'], { ...identity, cwd: directory, env: isolatedPgEnvironment(process.env, directory), stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', bytes => { serverLog = (serverLog + bytes).slice(-3000) })
  server.stderr.on('data', bytes => { serverLog = (serverLog + bytes).slice(-3000) })
  let startupError
  server.on('error', error => { startupError = error })
  const deadline = Date.now() + 15000
  while (!admin) {
    if (startupError) throw startupError
    try { admin = await connect() } catch (error) {
      if (Date.now() > deadline || server.exitCode !== null) throw new Error(`Isolated database did not start: ${error.message}. ${serverLog}`)
      await delay(100)
    }
  }
  await check('native cluster has no TCP listener', async () => assert.equal(await scalar(admin, 'show listen_addresses'), ''))
  await admin.query(await source('tests/local-bootstrap.sql'))
  const history = JSON.parse(await readFile(path.join(root, 'supabase/migration-history.json'), 'utf8'))
  assert.equal(history.project_ref, 'nkfecpdegcmsapvbviky')
  await admin.query(await source(history.initial_schema.repository_path))
  for (const mapping of history.mappings) await admin.query(await source(mapping.repository_path, mapping.repository_sha256))
  for (const fixture of ['tests/live-database.sql', 'tests/live-payment-database.sql']) {
    await check(`${path.basename(fixture)} passes on native PostgreSQL`, async () => {
      const result = await admin.query(await source(fixture))
      assert.match(result.at(-1).rows[0].verification, /^PASS:/)
    })
  }
  await admin.query('insert into auth.users(id) values($1),($2)', [A, B])
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [SA, A, SB, B])
  await admin.query("insert into public.posts(user_id,idea,platform,tone,caption,status) values($1,'Native Beta fixture','Instagram','Friendly','Synthetic retained caption','approved')", [A])
  await admin.query("insert into storage.objects(bucket_id,name) values('post-media',$1)", [`${A}/retained.png`])
  const retained = (await admin.query('select id,user_id,caption,status,revision,created_at from public.posts order by id')).rows
  const payloads = ['supabase/migrations/20261013000000_require_prior_approval.sql', 'supabase/migrations/20261014000000_owner_monitoring.sql', 'supabase/proposals/20261015000000_private_beta_safety.sql']
  const manifest = JSON.parse(await readFile(path.join(root, 'deployment/beta-review.json'), 'utf8'))
  for (const file of payloads) {
    const hash = manifest.files.find(item => item.path === file)?.sha256
    assert.ok(hash, `Missing reviewed hash for ${file}`)
    await admin.query(await source(file, hash))
  }
  const a = await connect('authenticated', A, SA), b = await connect('authenticated', B, SB)
  const service = await connect('service_role')
  await check('three exact reviewed payloads preserve old posts, revisions and media', async () => {
    assert.deepEqual((await admin.query('select id,user_id,caption,status,revision,created_at from public.posts order by id')).rows, retained)
    assert.equal(await scalar(admin, 'select count(*)::int from storage.objects'), 1)
  })
  await check('all release gates start closed and memberships start empty', async () => {
    assert.equal(await scalar(admin, 'select ai_enabled or uploads_enabled or daily_call_limit<>0 or daily_budget_usd<>0 from private.beta_controls'), false)
    assert.equal(await scalar(admin, 'select publishing_enabled or billing_enabled from private.launch_controls'), false)
    assert.equal(await scalar(admin, 'select count(*)::int from private.beta_members'), 0)
    assert.equal(await scalar(a, 'select public.beta_access()'), false)
    assert.equal(await scalar(a, 'select count(*)::int from public.posts'), 0)
    await assert.rejects(a.query('select * from private.beta_controls'), error => error.code === '42501')
  })
  await admin.query("insert into private.beta_members(user_id,expires_at) values($1,now()+interval '1 day'),($2,now()+interval '1 day')", [A, B])
  await check('synthetic invite membership preserves two-user isolation and disabled direct uploads', async () => {
    assert.equal(await scalar(a, 'select count(*)::int from public.posts'), retained.length)
    assert.equal(await scalar(b, 'select count(*)::int from public.posts'), 0)
    await assert.rejects(a.query("insert into storage.objects(bucket_id,name) values('post-media',$1)", [`${A}/blocked.png`]), error => error.code === '42501')
  })
  await check('prior approval is required for direct scheduled inserts', async () => {
    await assert.rejects(a.query("insert into public.posts(user_id,idea,platform,tone,caption,status,scheduled_for) values($1,'No approval','Instagram','Friendly','Synthetic','scheduled',now()+interval '1 day')", [A]), /Approve before scheduling/)
  })
  // Synthetic prices and AI gates only in this disposable cluster. No provider exists here.
  await admin.query('update private.beta_controls set ai_enabled=true,daily_call_limit=2,daily_budget_usd=0.04,request_reserve_usd=0.02,input_usd_per_million=1,output_usd_per_million=2')
  const workers = await Promise.all(Array.from({ length: 8 }, (_, index) => connect('authenticated', index % 2 ? B : A, index % 2 ? SB : SA)))
  const pids = await Promise.all(workers.map(client => scalar(client, 'select pg_backend_pid()')))
  assert.equal(new Set(pids).size, workers.length)
  let reservations
  await check('eight independent overlapping sessions cannot overspend the two-request project budget', async () => {
    // Hold the exact configuration row while each independent backend begins its request.
    await admin.query('begin')
    await admin.query('select singleton from private.beta_controls for update')
    const requests = workers.map(client => scalar(client, "select public.reserve_ai_request('gemini-2.5-flash')"))
    try {
      const deadline = Date.now() + 4000
      while (true) {
        await admin.query('select pg_stat_clear_snapshot()')
        if (await scalar(admin, "select count(*)::int from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids]) === workers.length) break
        if (Date.now() > deadline) throw new Error('Independent reservation sessions did not all wait on the configuration lock')
        await delay(25)
      }
      await admin.query('commit')
      reservations = (await Promise.all(requests)).filter(Boolean)
    } catch (error) {
      await admin.query('rollback')
      await Promise.allSettled(requests)
      throw error
    }
    assert.equal(reservations.length, 2)
    assert.equal(await scalar(admin, 'select count(*)::int from private.ai_requests'), 2)
    assert.equal(Number(await scalar(admin, 'select sum(reserve_usd) from private.ai_requests')), 0.04)
    assert.equal(Number(await scalar(admin, 'select sum(calls) from public.ai_usage')), 2)
  })
  await check('client completion forgery fails and server completion remains idempotent', async () => {
    await assert.rejects(a.query("select public.finish_ai_request($1,'success',1,1,1)", [reservations[0].id]), error => error.code === '42501')
    assert.equal(await scalar(service, "select public.finish_ai_request($1,'success',100,200,10)", [reservations[0].id]), true)
    assert.equal(await scalar(service, "select public.finish_ai_request($1,'success',100,200,10)", [reservations[0].id]), false)
  })
  const ledgerCount = await scalar(admin, 'select count(*)::int from private.ai_requests')
  await admin.query(await source('supabase/proposals/20261015000000_private_beta_safety.rollback.sql', manifest.files.find(item => item.path.endsWith('private_beta_safety.rollback.sql')).sha256))
  await check('operational rollback pauses runtime grants without deleting content or weakening invites', async () => {
    assert.equal(await scalar(admin, 'select ai_enabled or uploads_enabled from private.beta_controls'), false)
    assert.deepEqual((await admin.query('select id,user_id,caption,status,revision,created_at from public.posts order by id')).rows, retained)
    assert.equal(await scalar(admin, 'select count(*)::int from private.ai_requests'), ledgerCount)
    assert.equal(await scalar(admin, 'select count(*)::int from storage.objects'), 1)
    await assert.rejects(a.query("select public.reserve_ai_request('gemini-2.5-flash')"), error => error.code === '42501')
    assert.equal(await scalar(a, 'select public.consume_ai_quota()'), false)
    await admin.query('update private.beta_members set revoked=true where user_id=$1', [B])
    assert.equal(await scalar(b, 'select public.beta_access()'), false)
    assert.equal(await scalar(admin, 'select publishing_enabled or billing_enabled from private.launch_controls'), false)
  })
  await check('native logical backup restores synthetic rows, RLS, policies and functions into a fresh database', async () => {
    const before = await restoreSnapshot(admin)
    const archive = path.join(directory, 'synthetic-beta.dump')
    const roles = path.join(directory, 'synthetic-roles.sql')
    await run('pg_dump', ['--host', directory, '--port', '5432', '--username', 'postgres', '--no-password', '--format=custom', '--file', archive, 'postgres'])
    await run('pg_dumpall', ['--host', directory, '--port', '5432', '--username', 'postgres', '--no-password', '--roles-only', '--no-role-passwords', '--file', roles])
    const archiveBytes = await readFile(archive)
    assert.equal(archiveBytes.subarray(0, 5).toString(), 'PGDMP')
    const rolesSQL = await readFile(roles, 'utf8')
    assert.match(rolesSQL, /CREATE ROLE authenticated;/)
    assert.doesNotMatch(rolesSQL, /PASSWORD\s+'/i)
    await admin.query('create database aasiflow_beta_restore with template template0')
    await run('pg_restore', ['--host', directory, '--port', '5432', '--username', 'postgres', '--no-password', '--exit-on-error', '--dbname', 'aasiflow_beta_restore', archive])
    const restored = await connect('postgres', undefined, undefined, 'aasiflow_beta_restore')
    assert.deepEqual(await restoreSnapshot(restored), before)
    const restoredA = await connect('authenticated', A, SA, 'aasiflow_beta_restore')
    const restoredB = await connect('authenticated', B, SB, 'aasiflow_beta_restore')
    assert.equal(await scalar(restoredA, 'select count(*)::int from public.posts'), retained.length)
    assert.equal(await scalar(restoredB, 'select public.beta_access()'), false)
    assert.equal(await scalar(restoredB, 'select count(*)::int from public.posts'), 0)
    await assert.rejects(restoredA.query("select public.reserve_ai_request('gemini-2.5-flash')"), error => error.code === '42501')
    assert.equal(await scalar(restored, 'select publishing_enabled or billing_enabled from private.launch_controls'), false)
    report.syntheticLogicalRestoreVerified = true
    report.archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex')
    report.rolesSha256 = createHash('sha256').update(rolesSQL).digest('hex')
    report.snapshotSha256 = createHash('sha256').update(JSON.stringify(before)).digest('hex')
    // Roles are recorded password-free; the restore reuses the isolated cluster's roles.
    // Actual hosted Auth/Storage, stored-object bytes and separate-cluster role restoration remain unverified.
  })
  report.status = 'passed'
} catch (error) {
  report.status = server ? 'failed' : 'blocked'
  report.reason = error.message
  throw error
} finally {
  await Promise.allSettled([...clients].map(client => client.end()))
  if (server && server.exitCode === null) await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  report.stopped = !server || server.exitCode !== null || server.signalCode !== null
  // Keep synthetic data/evidence for inspection; never delete customer backups.
  await writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
  await mkdir(path.join(root, 'test-results'), { recursive: true })
  await writeFile(path.join(root, 'test-results/native-beta.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`Synthetic native evidence: ${path.join(directory, 'verification.json')}\n`)
}
