import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const postId = '33333333-3333-4333-8333-333333333333'
test('PostgreSQL RLS, approval transitions and server-only quotas', async (t) => {
  const db = new PGlite()
  try {
    // Simulate Supabase's roles and authenticated UID function, not a live auth service.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      insert into auth.users values ('${userA}'), ('${userB}');
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text unique, metadata jsonb default '{}');
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select string_to_array(regexp_replace(name, '/[^/]+$', ''), '/') $$;
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
      grant execute on function storage.foldername(text) to authenticated;
    `)
    const directory = new URL('../supabase/migrations/', import.meta.url)
    for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(new URL(name, directory), 'utf8'))
    }
    const asUser = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); await db.exec('set role authenticated') }
    await t.test('user can create own draft; forged approval metadata is cleared', async () => {
      await asUser(userA)
      await db.query(`insert into public.posts(id,user_id,idea,platform,tone,caption,status,approved_at,approved_by,scheduled_for)
        values ($1,$2,'Useful business idea','Instagram','Friendly','Caption','draft',now(),$2,now())`, [postId, userA])
      const { rows } = await db.query('select * from public.posts')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].approved_at, null)
      assert.equal(rows[0].scheduled_for, null)
    })
    await t.test('another user cannot read, update or create posts for the owner', async () => {
      await asUser(userB)
      assert.equal((await db.query('select * from public.posts')).rows.length, 0)
      assert.equal((await db.query("update public.posts set caption='Intrusion' where id=$1 returning id", [postId])).rows.length, 0)
      await assert.rejects(db.query("insert into public.posts(user_id,idea,platform,tone,caption,status) values ($1,'Forged idea','Instagram','Friendly','Caption','draft')", [userA]))
    })
    await t.test('draft cannot schedule directly; approval stamps authenticated identity', async () => {
      await asUser(userA)
      await assert.rejects(db.query("update public.posts set status='scheduled',scheduled_for=now()+interval '1 day' where id=$1", [postId]))
      const { rows } = await db.query("update public.posts set status='approved',approved_by=$2,approved_at='2000-01-01' where id=$1 returning *", [postId, userB])
      assert.equal(rows[0].approved_by, userA)
      assert.ok(new Date(rows[0].approved_at).getTime() > new Date('2000-01-02').getTime())
    })
    await t.test('past scheduling fails; approved posts can schedule; edits clear approval and schedule', async () => {
      await assert.rejects(db.query("update public.posts set status='scheduled',scheduled_for=now()-interval '1 day' where id=$1", [postId]))
      assert.equal((await db.query("update public.posts set status='scheduled',scheduled_for=now()+interval '1 day' where id=$1 returning status", [postId])).rows[0].status, 'scheduled')
      const { rows } = await db.query("update public.posts set caption='Edited caption' where id=$1 returning *", [postId])
      assert.equal(rows[0].status, 'draft')
      assert.equal(rows[0].approved_by, null)
      assert.equal(rows[0].approved_at, null)
      assert.equal(rows[0].scheduled_for, null)
    })
    await t.test('ownership cannot change, including to another authenticated user', async () => {
      await assert.rejects(db.query('update public.posts set user_id=$2 where id=$1', [postId, userB]))
    })
    await t.test('users cannot increment or reset their own credits through the database', async () => {
      await assert.rejects(db.query('select public.consume_ai_credit($1)', [userA]))
      await assert.rejects(db.query('insert into public.ai_daily_usage values ($1,current_date,1)', [userA]))
    })
    await t.test('server reserves at most 20 credits per UTC date, independently per user', async () => {
      await db.exec('reset role; set role service_role')
      const results = await Promise.all(Array.from({ length: 25 }, () => db.query('select public.consume_ai_credit($1) as allowed', [userA])))
      assert.equal(results.filter((result) => result.rows[0].allowed).length, 20)
      assert.equal((await db.query('select public.consume_ai_credit($1) as allowed', [userB])).rows[0].allowed, true)
      await asUser(userA)
      const { rows } = await db.query('select * from public.ai_daily_usage')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].attempts, 20)
      assert.equal(rows[0].user_id, userA)
    })
    await t.test('anonymous users cannot access posts, usage or quota functions', async () => {
      await db.exec('reset role; set role anon')
      await assert.rejects(db.query('select * from public.posts'))
      await assert.rejects(db.query('select * from public.ai_daily_usage'))
      await assert.rejects(db.query('select public.consume_ai_credit($1)', [userA]))
    })
    await t.test('private storage allows only the owners folder and blocks object replacement', async () => {
      await db.exec('reset role')
      await db.query("insert into storage.objects(bucket_id,name) values ('aasiflow-media',$1)", [`${userA}/photo.png`])
      await asUser(userA)
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('aasiflow-media',$1)", [`${userA}/client-upload.png`]))
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('aasiflow-media',$1)", [`${userB}/photo.png`]))
      assert.equal((await db.query("update storage.objects set name=$1 returning id", [`${userA}/replaced.png`])).rows.length, 0)
      await asUser(userB)
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0)
      await asUser(userA)
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 1)
      await db.exec('reset role')
      const bucket = (await db.query("select * from storage.buckets where id='aasiflow-media'")).rows[0]
      assert.equal(bucket.public, false)
      assert.equal(Number(bucket.file_size_limit), 52428800)
      assert.equal(bucket.allowed_mime_types.includes('image/svg+xml'), false)
    })
    await t.test('media reservations enforce daily attempts, per-file size and storage capacity', async () => {
      await asUser(userA)
      await assert.rejects(db.query("select public.reserve_media_upload($1,1,'png')", [userA]))
      await db.exec('reset role; set role service_role')
      await assert.rejects(db.query("select public.reserve_media_upload($1,10485761,'png')", [userA]))
      await assert.rejects(db.query("select public.reserve_media_upload($1,10,'svg')", [userA]))
      const first = (await db.query("select public.reserve_media_upload($1,52428800,'mp4') as value", [userA])).rows[0].value
      assert.equal(first.path.startsWith(`${userA}/`), true)
      const second = (await db.query("select public.reserve_media_upload($1,52428800,'mp4') as value", [userA])).rows[0].value
      assert.equal((await db.query("select public.reserve_media_upload($1,1,'png') as value", [userA])).rows[0].value, null)
      await db.query('select public.finish_media_upload($1,false)', [first.id])
      await db.query('select public.finish_media_upload($1,false)', [second.id])
      for (let attempt = 0; attempt < 3; attempt++) {
        const next = (await db.query("select public.reserve_media_upload($1,1,'png') as value", [userA])).rows[0].value
        assert.ok(next)
        await db.query('select public.finish_media_upload($1,false)', [next.id])
      }
      assert.equal((await db.query("select public.reserve_media_upload($1,1,'png') as value", [userA])).rows[0].value, null)
      await asUser(userB)
      assert.equal((await db.query('select * from public.media_upload_attempts')).rows.length, 0)
    })
  } finally { await db.close() }
})
