import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),A='a1111111-1111-4111-8111-111111111111',C='c1111111-1111-4111-8111-111111111111'
let checks=0
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++}
const inventory=await readFile('supabase/media-inventory.sql','utf8')
try {
  await db.exec(await readFile('tests/local-bootstrap.sql','utf8'))
  for(const filename of (await readdir('supabase/migrations')).filter(name=>/^\d+_.+\.sql$/.test(name)).sort())await db.exec(await readFile(`supabase/migrations/${filename}`,'utf8'))
  await db.query('insert into auth.users(id) values($1)',[A])
  const object=async(name,{size=32,mime='image/png',created='2020-01-01',updated=created}={})=>{
    const path=name.includes('/')?name:`${A}/${name}`
    await db.query("insert into storage.objects(bucket_id,name,metadata,created_at,updated_at) values('post-media',$1,$2,$3,$4)",[path,{size,mimetype:mime},created,updated]);return path
  }
  await object('aged-unreferenced');await object('recent',{created:new Date().toISOString()})
  await object('old-but-recently-modified',{updated:new Date().toISOString()})
  await object('zero-byte',{size:0});await object(`${A}/.emptyFolderPlaceholder`,{size:'unknown'})
  await object('unknown-size',{size:'unknown'});await object('wrong-mime',{mime:'text/html'})
  await object('too-large',{size:10485761});await object('future',{created:'2099-01-01'})
  await object('time-inversion',{created:'2020-01-02',updated:'2020-01-01'})
  await object(`${C}/missing-owner`);await object(`${A}/nested/file`)
  const referenced=await object('draft.png')
  const media={path:referenced,name:'draft.png',type:'image/png',size:32}
  await db.query("insert into public.posts(user_id,idea,platform,tone,caption,status,media) values($1,'Retention draft','Instagram','Friendly','Private attachment','draft',$2)",[A,media])
  await db.query("insert into public.social_connections(id,user_id,provider,account_id,account_name,expires_at) values($1,$2,'linkedin','test-id','Isolated fixture',now()+interval '1 day')",[C,A])
  for(const status of ['queued','processing','published','failed','uncertain','cancelled']){
    const path=await object(`snapshot-${status}.png`)
    await db.query('insert into public.publication_jobs(user_id,connection_id,post_revision,snapshot,due_at,status) values($1,$2,1,$3,now(),$4)',[A,C,{media:{...media,path}},status])
  }
  const before=await db.query('select count(*)::int as n from storage.objects')
  await db.exec('begin read only')
  const rows=(await db.query(inventory)).rows
  await db.exec('rollback')
  const state=name=>rows.find(row=>row.name===`${A}/${name}`)?.review_status
  equal(state('aged-unreferenced'),'review_candidate')
  for(const name of ['recent','old-but-recently-modified'])equal(state(name),'keep_recent')
  for(const name of ['zero-byte','.emptyFolderPlaceholder'])equal(state(name),'keep_placeholder')
  for(const name of ['unknown-size','wrong-mime','too-large','future','time-inversion','nested/file'])equal(state(name),'manual_review')
  equal(rows.find(row=>row.name===`${C}/missing-owner`).review_status,'manual_review')
  equal(state('draft.png'),'keep_referenced')
  for(const status of ['queued','processing','published','failed','uncertain','cancelled'])equal(state(`snapshot-${status}.png`),'keep_referenced')
  equal(rows.every(row=>row.deletion_authorized===false),true)
  equal((await db.query('select count(*)::int as n from storage.objects')).rows,before.rows)
  equal(rows.length,19)
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);await assert.rejects(db.query(inventory));checks++;await db.exec('reset role')
  }
  console.log(`PASS: ${checks} read-only media inventory checks; every job state and draft is protected, age/metadata/owner boundaries fail closed, no deletion is authorized, client roles are denied.`)
} finally {await db.close()}
