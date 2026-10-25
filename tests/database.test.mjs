import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('deployed migration bodies match the existing history manifest', () => {
  const history = JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'))
  assert.equal(history.project_ref,'nkfecpdegcmsapvbviky')
  for (const mapping of history.mappings) {
    const source = fs.readFileSync(mapping.repository_path,'utf8').replace(/\r\n/g,'\n')
    assert.equal(createHash('sha256').update(source).digest('hex'),mapping.repository_sha256,mapping.repository_path)
  }
})

test('canonical migrations preserve legacy rows, policies and backend names', async () => {
  const db = new PGlite()
  try {
    await db.exec(fs.readFileSync('tests/local-bootstrap.sql','utf8'))
    const files = fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()
    await db.exec(fs.readFileSync('supabase/migrations/' + files[0],'utf8'))
    await db.exec(`insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
      insert into public.posts(id,user_id,idea,platform,tone,caption,hashtags,status,created_at)
      values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Legacy idea','Instagram','Friendly','Legacy caption',array['Legacy'],'approved','2026-01-01');`)
    const before = (await db.query('select id,user_id,idea,caption,hashtags,status,created_at from public.posts')).rows
    for (const name of files.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/' + name,'utf8'))
    assert.deepEqual((await db.query('select id,user_id,idea,caption,hashtags,status,created_at from public.posts')).rows,before)
    const buckets = (await db.query('select id,public from storage.buckets')).rows
    assert.deepEqual(buckets,[{id:'post-media',public:false}])
    const objects = (await db.query(`select to_regclass('public.ai_usage') is not null as existing,
      to_regclass('public.ai_daily_usage') is null as no_duplicate,
      to_regclass('public.media_upload_attempts') is null as no_upload_duplicate`)).rows[0]
    assert.deepEqual(objects,{existing:true,no_duplicate:true,no_upload_duplicate:true})
    assert.equal((await db.query(`select count(*)::int as n from pg_trigger where tgrelid='public.posts'::regclass and tgname in ('guard_post_lifecycle','aa_require_prior_approval')`)).rows[0].n,2)
    const policies = (await db.query(`select qual,with_check from pg_policies where schemaname='public' and tablename='posts'`)).rows
    assert.equal(policies.length,4)
    assert.ok(policies.every(p => (p.qual ?? p.with_check).includes('has_active_session')))
    await db.exec(`insert into auth.sessions(id,user_id) values ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111');
      select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"44444444-4444-4444-8444-444444444444"}',false);
      set role authenticated;
      insert into public.posts(id,user_id,idea,platform,tone,caption,status) values ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','New draft','Instagram','Friendly','Caption','draft');`)
    await assert.rejects(db.query(`update public.posts set status='scheduled',scheduled_for=now()+interval '1 day' where id='55555555-5555-4555-8555-555555555555'`), /Approve before scheduling/)
    await assert.rejects(db.query(`insert into public.posts(user_id,idea,platform,tone,caption,status,scheduled_for) values ('11111111-1111-4111-8111-111111111111','No review','Instagram','Friendly','Caption','scheduled',now()+interval '1 day')`), /Approve before scheduling/)
    await db.exec(`update public.posts set status='approved' where id='55555555-5555-4555-8555-555555555555';
      update public.posts set status='scheduled',scheduled_for=now()+interval '1 day' where id='55555555-5555-4555-8555-555555555555';`)
    assert.equal((await db.query(`select status,revision from public.posts where id='55555555-5555-4555-8555-555555555555'`)).rows[0].revision,3)
  } finally { await db.close() }
})
