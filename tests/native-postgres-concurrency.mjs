// Real, independent PostgreSQL connections against a disposable socket-only
// cluster. No existing database URL, Supabase project, provider or SMTP is used.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chown, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const bin = process.env.AASIFLOW_TEST_PG_BIN
if (!bin || !path.isAbsolute(bin)) throw new Error('Set AASIFLOW_TEST_PG_BIN to an absolute native PostgreSQL bin directory.')
const driver = process.env.AASIFLOW_TEST_PG_DRIVER || createRequire(import.meta.url).resolve('pg')
const module = await import(pathToFileURL(driver).href)
const { Client } = module.default ?? module
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const reportPath = path.resolve(root, process.argv[2] ?? `tests/native-postgres-concurrency-${new Date().toISOString().slice(0, 10)}.json`)
const directory = await mkdtemp(path.join(os.tmpdir(), 'aasiflow-pg-concurrency-'))
const data = path.join(directory, 'data')
const identity = process.getuid?.() === 0 ? { uid: 65534, gid: 65534 } : {}
const clients = new Set()
let server, admin, serverLogs = ''
const report = {
  verified_at_utc: new Date().toISOString(), scope: 'Disposable native PostgreSQL, independent backend connections',
  checks: [], migrations: [], cluster_started: false, cluster_stopped: false, cluster_removed: false,
  live_project_modified: false, provider_calls: false, uploads: false, website_or_social_publication: false, payment_transaction: false,
  limitations: 'Auth and Storage catalogs are modeled. Actual provider APIs, hosted worker execution and email delivery are not tested.',
}
const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222'
const SA = 'a3333333-3333-4333-8333-333333333333', SB = 'b4444444-4444-4444-8444-444444444444'
const C = 'c5555555-5555-4555-8555-555555555555'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...identity, cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes })
    child.stderr.on('data', bytes => { output += bytes })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`Native PostgreSQL command failed (${code}): ${output.slice(-1200)}`)))
  })
}
async function connect(role = 'postgres', uid, sid) {
  const client = new Client({ host: directory, port: 5432, user: 'postgres', database: 'postgres', connectionTimeoutMillis: 1000, options: '-c statement_timeout=4000 -c lock_timeout=1000' })
  client.on('error', () => {})
  try { await client.connect() } catch (error) { await client.end().catch(() => {}); throw error }
  clients.add(client)
  await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, ...(uid ? { sub: uid, session_id: sid } : {}) })])
  assert.ok(['postgres', 'service_role', 'authenticated', 'anon'].includes(role))
  if (role !== 'postgres') await client.query(`set role ${role}`)
  return client
}
async function value(client, sql, params = []) { return Object.values((await client.query(sql, params)).rows[0])[0] }
async function check(name, fn, { continueOnFailure = false } = {}) {
  const item = { name, passed: false }
  report.checks.push(item)
  try { await fn(); item.passed = true }
  catch (error) {
    item.failure = { message: error.message, postgres_code: error.code ?? null }
    if (!continueOnFailure) throw error
  }
  console.log(JSON.stringify(item))
}
async function approvedPost() {
  const id = randomUUID()
  await admin.query("insert into public.posts(id,user_id,idea,platform,tone,caption,status) values($1,$2,'Concurrent queue fixture','LinkedIn','Friendly','Approved fixture caption','approved')", [id, A])
  return id
}
try {
  if (identity.uid !== undefined) await chown(directory, identity.uid, identity.gid)
  report.server_version = (await run(path.join(bin, 'postgres'), ['--version'])).trim()
  await run(path.join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8', '--no-sync'])
  server = spawn(path.join(bin, 'postgres'), ['-D', data, '-k', directory, '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700', '-c', 'max_connections=40', '-c', 'log_min_messages=error'], { ...identity, cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', bytes => { serverLogs = (serverLogs + bytes).slice(-3000) })
  server.stderr.on('data', bytes => { serverLogs = (serverLogs + bytes).slice(-3000) })
  const deadline = Date.now() + 10000
  while (!admin) {
    try { admin = await connect() } catch (error) { if (Date.now() >= deadline || server.exitCode !== null) throw error; await sleep(50) }
  }
  report.cluster_started = true
  assert.equal(await value(admin, 'show listen_addresses'), '')
  report.listener = 'Private Unix socket only; TCP disabled'
  await admin.query(await readFile(path.join(root, 'tests/local-bootstrap.sql'), 'utf8'))
  for (const filename of (await readdir(path.join(root, 'supabase/migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const sql = await readFile(path.join(root, 'supabase/migrations', filename), 'utf8')
    await admin.query(sql)
    report.migrations.push({ filename, sha256: createHash('sha256').update(sql).digest('hex') })
  }
  for (const filename of ['live-database.sql', 'live-payment-database.sql']) {
    await check(`${filename} passes against native PostgreSQL`, async () => {
      const result = await admin.query(await readFile(path.join(root, 'tests', filename), 'utf8'))
      assert.ok(String(result.at(-1).rows[0].verification).startsWith('PASS:'))
    })
  }
  await admin.query('insert into auth.users(id) values($1),($2)', [A, B])
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [SA, A, SB, B])
  await admin.query("insert into public.social_connections(id,user_id,provider,account_id,account_name,expires_at) values($1,$2,'linkedin','fixture123','Synthetic test profile',now()+interval '30 days')", [C, A])
  const service = await connect('service_role'), user = await connect('authenticated', A, SA)
  await check('ordinary user cannot claim a publication', async () => {
    await assert.rejects(value(user, 'select public.service_claim_publication()'), error => error.code === '42501')
  })
  await check('closed local publishing gate prevents claims', async () => { assert.equal(await value(service, 'select public.service_claim_publication()'), null) })
  // Only the disposable cluster's gates are opened. There is no worker or provider.
  await admin.query('update private.launch_controls set publishing_enabled=true,billing_enabled=true')
  const post1 = await approvedPost(), post2 = await approvedPost()
  const users = await Promise.all(Array.from({ length: 24 }, () => connect('authenticated', A, SA)))
  const pids = await Promise.all(users.map(client => value(client, 'select pg_backend_pid()')))
  assert.equal(new Set(pids).size, 24)
  report.independent_worker_connections = 24
  let job1, job2
  await check('eight overlapping enqueue attempts create exactly one job for one approved revision', async () => {
    const results = await Promise.allSettled(users.slice(0, 8).map(client => value(client, 'select public.enqueue_publication($1,$2,1,now())', [post1, C])))
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
    assert.ok(results.filter(item => item.status === 'rejected').every(item => item.reason.code === '23505'))
    job1 = results.find(item => item.status === 'fulfilled').value
    assert.equal(Number(await value(admin, 'select count(*) from public.publication_jobs where post_id=$1', [post1])), 1)
    job2 = await value(user, 'select public.enqueue_publication($1,$2,1,now())', [post2, C])
  })
  const workerA = await connect('service_role'), workerB = await connect('service_role'), workerC = await connect('service_role')
  let claimedA, claimedB
  await check('two workers claim distinct rows while both transactions overlap; third gets no duplicate', async () => {
    await workerA.query('begin')
    claimedA = await value(workerA, 'select public.service_claim_publication()')
    await workerB.query('begin')
    claimedB = await value(workerB, 'select public.service_claim_publication()')
    assert.ok(claimedA && claimedB)
    assert.deepEqual(new Set([claimedA.id, claimedB.id]), new Set([job1, job2]))
    assert.equal(await value(workerC, 'select public.service_claim_publication()'), null)
    await workerA.query('commit'); await workerB.query('commit')
  })
  await check('stale lease cannot finish; a successful requeue invalidates the old lease', async () => {
    assert.equal(await value(service, "select public.service_finish_publication($1,$2,'queued',null,null,null)", [claimedA.id, randomUUID()]), false)
    assert.equal(await value(service, "select public.service_finish_publication($1,$2,'queued',null,null,null)", [claimedA.id, claimedA.lease_id]), true)
    assert.equal(await value(service, "select public.service_finish_publication($1,$2,'published','urn:li:share:123',null,null)", [claimedA.id, claimedA.lease_id]), false)
  })
  await check('expired lease becomes uncertain and is not automatically claimed again', async () => {
    await admin.query("update public.publication_jobs set lease_until=now()-interval '1 second' where id=$1", [claimedB.id])
    assert.equal(await value(service, 'select public.service_claim_publication()'), null)
    assert.equal(await value(admin, 'select status from public.publication_jobs where id=$1', [claimedB.id]), 'uncertain')
    assert.equal(await value(admin, 'select attempts from public.publication_jobs where id=$1', [claimedB.id]), 1)
  })
  await check('worker skips an editing post, claims another due post and lets the editor cancel its queued revision', async () => {
    const post = await approvedPost(), available = await approvedPost()
    const lockedJob = await value(user, 'select public.enqueue_publication($1,$2,1,now())', [post, C])
    const availableJob = await value(user, 'select public.enqueue_publication($1,$2,1,now())', [available, C])
    await admin.query('begin')
    try {
      await admin.query('select id from public.posts where id=$1 for update', [post])
      assert.equal((await value(service, 'select public.service_claim_publication()')).id, availableJob)
      assert.equal(await value(service, 'select public.service_claim_publication()'), null)
      await admin.query("update public.posts set caption='Edited before dispatch' where id=$1", [post])
      assert.equal(await value(admin, 'select status from public.publication_jobs where id=$1', [lockedJob]), 'cancelled')
      assert.equal(await value(admin, 'select status from public.posts where id=$1', [post]), 'draft')
    } finally {
      await admin.query('rollback')
      await admin.query('delete from public.publication_jobs where id=any($1::uuid[])', [[lockedJob, availableJob]])
    }
  }, { continueOnFailure: true })
  await check('two overlapping workers reconcile expired leases without waiting or dispatching them again', async () => {
    const jobs = []
    for (let i=0;i<2;i++) jobs.push(await value(user, 'select public.enqueue_publication($1,$2,1,now())', [await approvedPost(), C]))
    for (let i=0;i<2;i++) assert.ok(jobs.includes((await value(service, 'select public.service_claim_publication()')).id))
    await admin.query("update public.publication_jobs set lease_until=now()-interval '1 second' where id=any($1::uuid[])", [jobs])
    await workerA.query('begin'); await workerB.query('begin')
    try {
      assert.equal(await value(workerA, 'select public.service_claim_publication()'), null)
      assert.equal(await value(workerB, 'select public.service_claim_publication()'), null)
    } finally { await workerA.query('commit'); await workerB.query('commit') }
    const rows = (await admin.query('select status,attempts from public.publication_jobs where id=any($1::uuid[])', [jobs])).rows
    assert.ok(rows.every(row=>row.status==='uncertain' && row.attempts===1))
  })
  await check('an orphaned queued job is cancelled without dispatch', async () => {
    const post = await approvedPost()
    const job = await value(user, 'select public.enqueue_publication($1,$2,1,now())', [post, C])
    await admin.query('update public.publication_jobs set post_id=null where id=$1', [job])
    assert.equal(await value(service, 'select public.service_claim_publication()'), null)
    assert.equal(await value(admin, 'select status from public.publication_jobs where id=$1', [job]), 'cancelled')
  })
  await check('eight overlapping OAuth takes consume one state exactly once', async () => {
    const hash = 'b'.repeat(64)
    assert.equal(await value(service, 'select public.service_oauth_start($1,$2,$3,$4)', [hash, A, SA, 'linkedin']), true)
    const readers = await Promise.all(Array.from({ length: 5 }, () => connect('service_role')))
    const results = await Promise.all([...readers, workerA, workerB, workerC].map(client => value(client, 'select public.service_oauth_take($1)', [hash])))
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(results.find(Boolean).user_id, A)
    for (const client of readers) { clients.delete(client); await client.end() }
  })
  const order = randomUUID()
  await admin.query("insert into public.payment_orders(id,user_id,plan_id,amount,credits,status) values($1,$2,'synthetic',10000,10,'pending')", [order, A])
  const paymentWorkers = [service, workerA, workerB, workerC]
  await check('overlapping duplicate payment events grant one credit-ledger entry', async () => {
    const results = await Promise.all(paymentWorkers.map((client, i) => value(client, 'select public.service_record_payment($1,$2,$3,$4,$5,$6)', [`evt_local_paid_${i}`, 'plink_Local123', order, 10000, 'INR', 'pay_Local123'])))
    assert.ok(results.every(Boolean))
    assert.equal(Number(await value(admin, 'select count(*) from public.credit_ledger where order_id=$1', [order])), 1)
    assert.equal(Number(await value(admin, 'select sum(credits) from public.credit_ledger where user_id=$1', [A])), 10)
  })
  await check('overlapping identical refund notifications reverse credits only once', async () => {
    const results = await Promise.all(paymentWorkers.map(client => value(client, 'select public.service_record_refund($1,$2,$3,$4,$5)', ['evt_local_refund', 'rfnd_Local123', 'pay_Local123', 2500, 'INR'])))
    assert.ok(results.every(Boolean))
    assert.equal(await value(admin, 'select refunded_amount from public.payment_orders where id=$1', [order]), 2500)
    assert.equal(Number(await value(admin, 'select sum(credits) from public.credit_ledger where user_id=$1', [A])), 7)
  })
  await check('overlapping distinct partial refunds reconcile exactly the full amount', async () => {
    const results = await Promise.all(paymentWorkers.slice(0, 3).map((client, i) => value(client, 'select public.service_record_refund($1,$2,$3,$4,$5)', [`evt_local_refund_${i}`, `rfnd_LocalPart${i}`, 'pay_Local123', 2500, 'INR'])))
    assert.ok(results.every(Boolean))
    assert.equal(await value(admin, 'select refunded_amount from public.payment_orders where id=$1', [order]), 10000)
    assert.equal(await value(admin, 'select credits_reversed from public.payment_orders where id=$1', [order]), 10)
    assert.equal(Number(await value(admin, 'select sum(credits) from public.credit_ledger where user_id=$1', [A])), 0)
  })
  await check('24 overlapping AI quota requests allow exactly 20 free attempts', async () => {
    const results = await Promise.all(users.map(client => value(client, 'select public.consume_ai_quota()')))
    assert.equal(results.filter(Boolean).length, 20)
    assert.equal(await value(admin, 'select calls from public.ai_usage where user_id=$1', [A]), 20)
  })
  await check('24 overlapping Storage metadata inserts preserve the 20-object owner quota', async () => {
    const results = await Promise.allSettled(users.map((client, i) => client.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['post-media', `${A}/local-fixture-${i}`])))
    report.storage_quota = { accepted: results.filter(item=>item.status==='fulfilled').length, denied_codes: results.filter(item=>item.status==='rejected').map(item=>item.reason.code) }
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 20)
    assert.deepEqual(report.storage_quota.denied_codes, Array(4).fill('42501'))
    assert.equal(Number(await value(admin, 'select count(*) from storage.objects')), 20)
  })
  // Retention is enabled only in this disposable cluster. No Storage API runs.
  await admin.query('update private.launch_controls set media_retention_enabled=true')
  const attaching=await connect('authenticated',B,SB), cleaner=await connect('service_role')
  const attachPid=await value(attaching,'select pg_backend_pid()'),cleanerPid=await value(cleaner,'select pg_backend_pid()')
  const retentionObject=async()=>{
    const id=randomUUID(),name=`${B}/${randomUUID()}`
    await admin.query("insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,version) values($1,'post-media',$2,'{\"size\":32,\"mimetype\":\"image/png\"}','2020-01-01','2020-01-01','isolated-version')",[id,name])
    return {id,media:{path:name,name:'isolated.png',type:'image/png',size:32}}
  }
  const attach=o=>attaching.query("insert into public.posts(user_id,idea,platform,tone,caption,status,media) values($1,'Concurrent retention','Instagram','Friendly','Private fixture','draft',$2)",[B,o.media])
  const waitForMediaLock=async pid=>{
    const deadline=Date.now()+700
    while(Date.now()<deadline){
      if(await value(admin,"select exists(select 1 from pg_stat_activity where pid=$1 and wait_event='advisory')",[pid]))return
      await sleep(20)
    }
    throw new Error('The second transaction did not wait on the media lock')
  }
  await check('attaching first makes quarantine wait and preserves the committed draft reference',async()=>{
    const o=await retentionObject();await attaching.query('begin');await attach(o)
    const pending=value(cleaner,'select public.service_quarantine_media($1)',[o.id]).then(result=>({result}),error=>({error}))
    await waitForMediaLock(cleanerPid);await attaching.query('commit')
    const result=await pending;if(result.error)throw result.error
    assert.equal(result.result,null)
    assert.equal(Number(await value(admin,"select count(*) from public.posts where media->>'path'=$1",[o.media.path])),1)
  })
  await check('quarantining first makes attach wait then rejects the stale request snapshot',async()=>{
    const o=await retentionObject();await cleaner.query('begin');const q=await value(cleaner,'select public.service_quarantine_media($1)',[o.id]);assert(q)
    const pending=attach(o).then(()=>({accepted:true}),error=>({accepted:false,code:error.code}))
    await waitForMediaLock(attachPid);await cleaner.query('commit')
    assert.deepEqual(await pending,{accepted:false,code:'23514'})
    assert.equal(Number(await value(admin,"select count(*) from public.posts where media->>'path'=$1",[o.media.path])),0)
  })
  await check('two overlapping quarantine requests share one immutable tombstone',async()=>{
    const o=await retentionObject()
    const results=await Promise.all([cleaner,service].map(client=>value(client,'select public.service_quarantine_media($1)',[o.id])))
    assert.equal(results[0].id,results[1].id)
    assert.equal(Number(await value(admin,'select count(*) from private.media_quarantine where object_id=$1',[o.id])),1)
  })
  await check('repeatable-read media attachment fails closed instead of using a stale snapshot',async()=>{
    const o=await retentionObject();await attaching.query('begin isolation level repeatable read')
    try{await assert.rejects(attach(o),error=>error.code==='P0001')}finally{await attaching.query('rollback')}
  })
  const due=[]
  for(let i=0;i<2;i++){
    const o=await retentionObject(),q=await value(cleaner,'select public.service_quarantine_media($1)',[o.id]);due.push(q.id)
    await admin.query("update private.media_quarantine set quarantined_at='2020-01-01',delete_after='2020-01-08' where id=$1",[q.id])
  }
  let deletionClaims
  await check('two overlapping retention workers claim different due objects',async()=>{
    deletionClaims=await Promise.all([cleaner,service].map(client=>value(client,'select public.service_claim_media_delete()')))
    assert.notEqual(deletionClaims[0].id,deletionClaims[1].id)
    assert.deepEqual(deletionClaims.map(q=>q.id).sort(),due.sort())
  })
  await check('the same deletion lease authorizes exactly one overlapping dispatch',async()=>{
    const q=deletionClaims[0]
    const results=await Promise.all([cleaner,service].map(client=>value(client,'select public.service_begin_media_delete($1,$2)',[q.id,q.lease_id])))
    assert.equal(results.filter(Boolean).length,1)
  })
  report.passed = report.checks.every(item => item.passed)
  if (!report.passed) process.exitCode = 1
} catch (error) {
  report.passed = false
  report.failure = { message: error.message, postgres_code: error.code ?? null }
  console.error(JSON.stringify(report.failure))
  process.exitCode = 1
} finally {
  await Promise.allSettled([...clients].map(client => client.end()))
  if (server && server.exitCode === null) {
    try { await run(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']); report.cluster_stopped = true }
    catch { server.kill('SIGKILL'); report.cluster_stopped = false; report.passed = false; process.exitCode = 1 }
  } else report.cluster_stopped = true
  if (!report.cluster_stopped) report.server_log_tail = serverLogs
  await rm(directory, { recursive: true, force: true })
  report.cluster_removed = true
  report.completed_at_utc = new Date().toISOString()
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, cluster_stopped: report.cluster_stopped, cluster_removed: report.cluster_removed }))
}
