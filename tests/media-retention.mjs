import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),A='a1111111-1111-4111-8111-111111111111',B='b2222222-2222-4222-8222-222222222222',S='a3333333-3333-4333-8333-333333333333',C='c1111111-1111-4111-8111-111111111111'
let checks=0
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++}
const value=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0]
const denied=async(sql,params=[],code)=>{await assert.rejects(db.query(sql,params),error=>!code||error.code===code);checks++}
const role=async name=>{await db.exec('reset role');await db.exec(`set role ${name}`)}
const object=async({name=randomUUID(),uid=A,size=32,mime='image/png',age='2020-01-01',version='isolated-version'}={})=>{
  const path=`${uid}/${name}`,id=randomUUID()
  await role('postgres')
  await db.query("insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,version) values($1,'post-media',$2,$3,$4,$4,$5)",[id,path,{size,mimetype:mime},age,version])
  return {id,path,media:{path,name,type:mime,size}}
}
const prepare=async o=>{await role('service_role');return value('select public.service_quarantine_media($1)',[o.id])}
const mature=async q=>{await role('postgres');await db.query("update private.media_quarantine set quarantined_at='2020-01-01',delete_after='2020-01-08' where id=$1",[q.id]);await role('service_role')}
const claim=()=>value('select public.service_claim_media_delete()')
const begin=q=>value('select public.service_begin_media_delete($1,$2)',[q.id,q.lease_id])
const finish=(q,deleted)=>value('select public.service_finish_media_delete($1,$2,$3)',[q.id,q.lease_id,deleted])
const post=async media=>db.query("insert into public.posts(user_id,idea,platform,tone,caption,status,media) values($1,'Retention fixture','Instagram','Friendly','Private fixture','draft',$2)",[A,media])
try {
  await db.exec(await readFile('tests/local-bootstrap.sql','utf8'))
  for(const filename of (await readdir('supabase/migrations')).filter(name=>/^\d+_.+\.sql$/.test(name)).sort())await db.exec(await readFile(`supabase/migrations/${filename}`,'utf8'))
  await db.query('insert into auth.users(id) values($1)',[A]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[S,A])
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:A,session_id:S})])
  const original=await object()
  equal(await prepare(original),null)
  equal(await claim(),null)
  for(const name of ['anon','authenticated']){
    await role(name)
    await denied('select * from private.media_quarantine',[], '42501')
    for(const sql of ['select public.service_media_retention_enabled()','select public.service_quarantine_media($1)','select public.service_claim_media_delete()'])await denied(sql,sql.includes('$1')?[original.id]:[],'42501')
  }
  await role('postgres');await db.exec('update private.launch_controls set media_retention_enabled=true')
  for(const options of [{age:new Date().toISOString()},{size:0},{size:'unknown'},{mime:'text/html'},{uid:B},{version:null}])equal(await prepare(await object(options)),null)
  const referenced=await object();await post(referenced.media);equal(await prepare(referenced),null)
  await role('postgres');await db.query("insert into public.social_connections(id,user_id,provider,account_id,account_name,expires_at) values($1,$2,'linkedin','fixture','Isolated retention',now()+interval '1 day')",[C,A])
  for(const status of ['queued','processing','published','failed','uncertain','cancelled']){
    const o=await object();await db.query('insert into public.publication_jobs(user_id,connection_id,post_revision,snapshot,due_at,status) values($1,$2,1,$3,now(),$4)',[A,C,{media:o.media},status]);equal(await prepare(o),null)
  }
  const q=await prepare(original);equal(q.status,'quarantined');equal((await prepare(original)).id,q.id)
  await role('postgres');equal(await value('select count(*)::int from private.media_quarantine'),1)
  equal(await value('select count(*)::int from storage.objects where id=$1',[original.id]),1)
  await role('authenticated');await denied("insert into public.posts(user_id,idea,platform,tone,caption,status,media) values($1,'Blocked reattach','Instagram','Friendly','Private','draft',$2)",[A,original.media],'23514')
  await role('postgres');await denied('insert into public.publication_jobs(user_id,connection_id,post_revision,snapshot,due_at) values($1,$2,1,$3,now())',[A,C,{media:original.media}],'23514')
  await role('service_role');equal(await claim(),null,'Seven-day quarantine grace is enforced')
  await mature(q);const active=await claim();equal(active.id,q.id);equal(active.object_id,original.id);equal(await claim(),null)
  equal(await value('select public.service_begin_media_delete($1,$2)',[active.id,randomUUID()]),false)
  equal(await begin(active),true);equal(await begin(active),false,'A lease dispatch can happen once')
  equal(await finish(active,true),false,'Claimed deletion without Storage removal is not accepted')
  await role('postgres');equal(await value('select status from private.media_quarantine where id=$1',[q.id]),'uncertain')
  await role('service_role');equal(await claim(),null)
  for(const field of ['version','metadata','updated_at']){
    const o=await object(),q=await prepare(o);await mature(q);const active=await claim()
    await role('postgres')
    // Test-catalog simulation of an independent provider/admin replacement.
    if(field==='version')await db.query("update storage.objects set version='replacement' where id=$1",[o.id])
    if(field==='metadata')await db.query("update storage.objects set metadata=metadata||'{\"size\":33}'::jsonb where id=$1",[o.id])
    if(field==='updated_at')await db.query("update storage.objects set updated_at=now() where id=$1",[o.id])
    await role('service_role');equal(await begin(active),false)
    await role('postgres');equal(await value('select status from private.media_quarantine where id=$1',[q.id]),'uncertain')
  }
  const completeObject=await object(),completeQ=await prepare(completeObject);await mature(completeQ);const complete=await claim();equal(await begin(complete),true)
  await role('postgres')
  // Local modeled metadata only. Production SQL never deletes Storage rows;
  // actual physical bytes and the Storage API are checked in an isolated project.
  await db.query('delete from storage.objects where id=$1',[completeObject.id])
  await role('service_role');equal(await finish(complete,true),true);equal(await finish(complete,true),true)
  await role('postgres');equal(await value('select status from private.media_quarantine where id=$1',[complete.id]),'deleted')
  await role('authenticated');await denied("insert into storage.objects(bucket_id,name) values('post-media',$1)",[completeObject.path],'42501')
  const expiredObject=await object(),expiredQ=await prepare(expiredObject);await mature(expiredQ);const expired=await claim()
  await role('postgres');await db.query("update private.media_quarantine set lease_until=now()-interval '1 second' where id=$1",[expired.id])
  await role('service_role');equal(await begin(expired),false);equal(await claim(),null)
  await role('postgres');equal(await value('select status from private.media_quarantine where id=$1',[expired.id]),'uncertain')
  await role('service_role');equal(await finish(expired,true),false)
  const isolation=await object()
  await db.exec('begin isolation level repeatable read')
  await denied("insert into public.posts(user_id,idea,platform,tone,caption,status,media) values($1,'Stale snapshot','Instagram','Friendly','Private','draft',$2)",[A,isolation.media],'P0001')
  await db.exec('rollback')
  equal(await value("select bool_and(prosecdef=false) from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'service_%media%'"),true)
  equal(await value("select relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='private' and c.relname='media_quarantine'"),true)
  console.log(`PASS: ${checks} isolated retention checks; closed gate/service grants, both grace periods, all references, tombstone reattach/reupload denial, single dispatch, identity changes, lost leases, uncertain outcomes and replay. No Storage bytes or live database are changed.`)
} catch(error){console.error(JSON.stringify({message:error.message,code:error.code}));process.exitCode=1}
finally {await db.close()}
