import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authRedirect, validateNewPassword } from '../src/lib/auth-flows.ts'
import { latestMetrics, observedPostingTime } from '../src/lib/analytics.ts'
import { validatePost } from '../src/lib/workflow.ts'
import type { Metric, Publication } from '../src/lib/integrations.ts'
test('password recovery requires 12–128 characters and fixed same-origin redirect',()=>{
  assert.throws(()=>validateNewPassword('short'))
  assert.throws(()=>validateNewPassword('a'.repeat(129)))
  assert.doesNotThrow(()=>validateNewPassword('a unique passphrase'))
  assert.equal(authRedirect('recovery','https://app.example'),'https://app.example/?flow=recovery')
  assert.throws(()=>authRedirect('recovery','http://app.example'))
  assert.equal(authRedirect('confirmed','http://localhost:5173'),'http://localhost:5173/?flow=confirmed')
})
test('post validation rejects malformed enums and too many hashtags; supports language marks',()=>{
  const post={id:'test',idea:'Test idea',platform:'Instagram' as const,tone:'Friendly',caption:'A real caption',hashtags:['हिन्दी','عربي'],status:'draft' as const,createdAt:new Date().toISOString()}
  assert.doesNotThrow(()=>validatePost(post))
  assert.throws(()=>validatePost({...post,hashtags:Array(9).fill('tag')}))
  assert.throws(()=>validatePost({...post,platform:'__proto__' as typeof post.platform}))
  assert.throws(()=>validatePost({...post,tone:'invalid'}))
})
test('analytics selects latest real observation and preserves missing metrics',()=>{
  const first:Metric={job_id:'a',source:'instagram',observed_at:'2026-10-01T12:00:00Z',impressions:null,reactions:0,comments:0,shares:null}
  const second={...first,observed_at:'2026-10-02T12:00:00Z',reactions:3}
  assert.equal(latestMetrics([first,second]).get('a')!.reactions,3)
  assert.equal(latestMetrics([first,second]).get('a')!.impressions,null)
})
test('posting-time recommendation requires comparable 24-hour measurements from enough posts',()=>{
  const jobs:Publication[]=[],metrics:Metric[]=[]
  for(let i=0;i<10;i++){
    const hour=i<5?10:18
    const published=`2026-09-${String(i+1).padStart(2,'0')}T${hour}:00:00Z`
    jobs.push({id:`j${i}`,post_id:null,connection_id:'c',status:'published',due_at:published,published_at:published,error_code:null,provider_post_id:`123${i}`})
    metrics.push({job_id:`j${i}`,source:'instagram',observed_at:new Date(Date.parse(published)+24*3600000).toISOString(),impressions:null,reactions:i<5?5:20,comments:0,shares:null})
  }
  assert.equal(observedPostingTime(jobs.slice(0,9),metrics,'instagram','UTC'),null)
  assert.equal(observedPostingTime(jobs,metrics.map(m=>({...m,observed_at:'2026-10-01T00:00:00Z'})),'instagram','UTC'),null)
  assert.equal(observedPostingTime(jobs,metrics,'linkedin','UTC'),null)
  assert.equal(observedPostingTime(jobs,metrics,'instagram','UTC')!.hour,'18')
  assert.equal(observedPostingTime(jobs,metrics,'instagram','Asia/Kolkata')!.hour,'23')
})
