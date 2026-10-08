import { useCallback, useEffect, useState } from 'react'
import { cancelPublication, emptyIntegrations, enqueuePublication, integrationData, serverAction, type IntegrationData, type Metric } from '../lib/integrations'
import { latestMetrics, observedPostingTime } from '../lib/analytics'
import type { Post } from '../types'
import { MediaPreview } from './MediaInput'
import { validateSnapshot } from '../../supabase/functions/_shared/providers'

const message = (error:unknown) => error instanceof Error ? error.message : 'This action could not be completed.'
export function ConnectionsPanel({userId,posts}:{userId?:string;posts:Post[]}) {
  const [data,setData] = useState<IntegrationData>(emptyIntegrations)
  const [configured,setConfigured] = useState({instagram:false,linkedin:false,publishing:false})
  const [loading,setLoading] = useState(true)
  const [now,setNow] = useState(() => Date.now())
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState<string|null>(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('connection') === 'connected') return 'Account connected. Publishing still requires owner activation.'
    if (params.get('connection') === 'failed') return 'Account connection failed or expired. For Instagram, choose one Facebook Page linked to your professional account. Check app permissions, then retry.'
    if (params.has('payment')) return 'Payment return received. Only a verified provider event can confirm payment; refresh the order status.'
    return null
  })
  const [error,setError] = useState<string|null>(null)
  const [postId,setPostId] = useState('')
  const [connectionId,setConnectionId] = useState('')
  const [time,setTime] = useState('')
  const [reviewed,setReviewed] = useState(false)
  const [plans,setPlans] = useState<{id:string;label:string;amount:number;credits:number}[]>([])
  const refresh = useCallback(async () => {
    try {
      const next = await (userId ? integrationData(userId) : Promise.resolve(emptyIntegrations)); setData(next);setNow(Date.now())
      if (next.ready) {
        try { setConfigured(await serverAction('social-account',{action:'status'})) } catch { setConfigured({instagram:false,linkedin:false,publishing:false}) }
        if (next.billing) { try { const result = await serverAction<{plans:typeof plans}>('payment-checkout',{action:'plans'});setPlans(result.plans) } catch { setPlans([]) } }
      }
    } catch (failure) {setError(message(failure))} finally {setLoading(false)}
  },[userId])
  useEffect(() => {let active=true;void Promise.resolve().then(()=>{if(active)void refresh()});return()=>{active=false}},[refresh])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()),60_000); return () => clearInterval(timer) },[])
  useEffect(() => {
    if (new URLSearchParams(location.search).has('connection') || new URLSearchParams(location.search).has('payment')) history.replaceState(null,'',location.pathname)
  },[])
  async function action(task:()=>Promise<void>) {
    setBusy(true);setError(null);setNotice(null)
    try { await task();await refresh() } catch (failure) {setError(message(failure))} finally {setBusy(false)}
  }
  function connect(provider:'instagram'|'linkedin') {
    void action(async () => {
      const {url} = await serverAction<{url:string}>('social-account',{action:'start',provider})
      const target = new URL(url); const expected = provider === 'instagram' ? 'www.facebook.com' : 'www.linkedin.com'
      if (target.protocol !== 'https:' || target.hostname !== expected || target.username || target.password || target.port) throw new Error('Invalid consent URL.')
      location.assign(target.toString())
    })
  }
  const eligible = posts.filter(post => ['approved','scheduled'].includes(post.status) && ['Instagram','LinkedIn'].includes(post.platform))
  const selected = eligible.find(post => post.id === postId)
  const selectedAccount = data.connections.find(account => account.id === connectionId)
  const validAccount = selectedAccount?.status === 'connected' && Date.parse(selectedAccount.expires_at) > now && selectedAccount.provider === selected?.platform.toLowerCase()
  const publishing = data.publishing && configured.publishing
  const metrics = latestMetrics(data.metrics)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const disabled = busy || loading
  return <section className="content integrations">
    <div className="panel"><div className="panel-head"><h2>Accounts & launch status</h2><button className="ghost" disabled={disabled} onClick={() => {setLoading(true);setError(null);void refresh()}}>Refresh</button></div>
      {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="form-notice">{notice}</p>}
      {!data.ready && <p className="workspace-notice">{userId ? 'The integration update is prepared and awaits owner approval before activation.' : 'Local demo. Sign in to use account-backed integrations.'}</p>}
      <p>Publishing: {publishing ? 'enabled for explicitly approved posts' : 'blocked until owner permission'}. Payments: {data.billing && plans.length ? 'configured' : 'blocked until owner permission and account setup'}.</p>
      <p>Instagram uses an official Meta app and a Facebook Page linked to a professional Instagram account. LinkedIn connects your personal profile.</p>
      <div className="connection-grid">{(['instagram','linkedin'] as const).map(provider => {
        const account = data.connections.find(c => c.provider === provider)
        const connected = account?.status === 'connected' && Date.parse(account.expires_at) > now
        return <article key={provider} className="connection-card"><h3>{provider === 'instagram' ? 'Instagram professional' : 'LinkedIn profile'}</h3><p>{connected ? account.account_name : account?.status === 'disconnected' ? 'Disconnected' : account ? 'Connection expired; reconnect' : 'No account connected'}</p>
          {connected && <p className="fineprint">Reconnect by {new Date(account.expires_at).toLocaleDateString()}.</p>}
          <button className="primary" disabled={disabled || !data.ready || !configured[provider]} onClick={() => connect(provider)}>{connected ? 'Reconnect' : 'Connect account'}</button>
          {!configured[provider] && <p className="fineprint">Official app credentials and callback setup are pending.</p>}
          {connected && <button className="ghost" disabled={disabled} onClick={() => {void action(async () => {await serverAction('social-account',{action:'disconnect',connectionId:account.id});setNotice('Disconnected from this workspace. Queued posts are cancelled. You can also revoke the app in the social platform settings.')})}}>Disconnect workspace</button>}
        </article>
      })}</div><p className="fineprint">Facebook and X remain drafting destinations.</p>
    </div>
    <div className="panel"><h2>Approve a publication</h2><p>Calendar entries are plans. Publication requires a separate review below and owner activation.</p>
      <div className="field-row"><label>Approved post<select value={postId} disabled={disabled || !publishing} onChange={e => {setPostId(e.target.value);setReviewed(false)}}><option value="">Choose a post</option>{eligible.map(p => <option value={p.id} key={p.id}>{p.platform}: {p.idea}</option>)}</select></label><label>Destination<select value={connectionId} disabled={disabled || !publishing} onChange={e => {setConnectionId(e.target.value);setReviewed(false)}}><option value="">Choose an account</option>{data.connections.filter(c => c.status === 'connected').map(c => <option value={c.id} key={c.id}>{c.provider}: {c.account_name}</option>)}</select></label></div>
      {selected && <p className="publication-caption" dir="auto">{selected.caption}{'\n\n'}{selected.hashtags.map(tag => `#${tag}`).join(' ')}</p>}
      {selected?.media && <MediaPreview key={selected.media.path} media={selected.media} />}
      {selected && selectedAccount && <p>Destination: {selectedAccount.account_name} · {selectedAccount.provider}. Post revision: {selected.revision}.</p>}
      <label>Publication time<input type="datetime-local" value={time} disabled={disabled || !publishing} onChange={e => {setTime(e.target.value);setReviewed(false)}} /><small>Leave empty to publish when the worker next runs. Times use {zone}.</small></label>
      <label className="review-check"><input type="checkbox" checked={reviewed} disabled={disabled || !publishing} onChange={e => setReviewed(e.target.checked)} />I reviewed this exact post and destination and approve publishing it.</label>
      <button className="primary" disabled={disabled || !publishing || !reviewed || !validAccount || !selected?.revision} onClick={() => {void action(async () => {
        if (!publishing || !selected || !reviewed || !validAccount || !selected.revision) throw new Error('Review the post and connected destination first.')
        validateSnapshot({caption:selected.caption,hashtags:selected.hashtags,platform:selected.platform,media:selected.media ?? null},userId!,selectedAccount!.provider)
        const when = time ? new Date(time) : new Date()
        if (!Number.isFinite(when.getTime()) || (time && when.getTime() <= Date.now())) throw new Error('Choose a future time.')
        await enqueuePublication(selected.id,connectionId,selected.revision,when.toISOString());setReviewed(false);setNotice('Publication queued. Check its result below.')
      })}}>Queue approved publication</button>
      <p className="fineprint">Instagram: JPEG photo or MP4 Reel. LinkedIn: text, JPEG/PNG image or MP4 video. Voice notes guide AI; they are not standalone social posts.</p>
    </div>
    <div className="panel"><h2>Publication results</h2>{!data.ready ? <p>Publication results will be available after account integration is activated and loaded.</p> : data.jobs.length === 0 ? <p>No publication jobs were found for your account.</p> : data.jobs.map(job => {
      const metric = metrics.get(job.id)
      return <article className="publication-row" key={job.id}><div><strong>{posts.find(p => p.id === job.post_id)?.idea ?? 'Saved publication'}</strong><p>{job.status} · {new Date(job.published_at ?? job.due_at).toLocaleString()}</p>{job.error_code && <p className="fineprint">{job.status === 'uncertain' ? 'The outcome needs owner review. Check the social profile before any retry.' : job.error_code.replaceAll('_',' ')}</p>}
        {metric && <p>Impressions: {metric.impressions ?? 'unavailable'} · Reactions: {metric.reactions ?? 'unavailable'} · Comments: {metric.comments ?? 'unavailable'} · Shares: {metric.shares ?? 'unavailable'}<br /><small>{metric.source} · observed {new Date(metric.observed_at).toLocaleString()}</small></p>}</div>
        {job.status === 'queued' && <button className="ghost" disabled={disabled} onClick={() => {void action(async () => {await cancelPublication(job.id);setNotice('Queued publication cancelled.')})}}>Cancel queued post</button>}
        {job.status === 'published' && <button className="ghost" disabled={disabled} onClick={() => {void action(async () => {await serverAction('social-account',{action:'metrics',jobId:job.id});setNotice('Real provider metrics refreshed.')})}}>Refresh metrics</button>}
      </article>
    })}<h3>Observed posting times</h3>{(['instagram','linkedin'] as Metric['source'][]).map(provider => {const observed = observedPostingTime(data.jobs,data.metrics,provider,zone);return <p key={provider}>{provider}: {observed ? `${observed.hour}:00–${String((Number(observed.hour)+1)%24).padStart(2,'0')}:00 (${zone}); median ${observed.median} reactions + comments across ${observed.samples} posts in this hour.` : 'Not enough comparable observations yet.'}</p>})}<p className="fineprint">Requires at least 10 posts measured near 24 hours after publishing and 3 posts in each compared hour. Past results do not guarantee future engagement.</p></div>
    <div className="panel"><h2>AI usage & payments</h2><p>{data.ready ? `${data.attempts} AI attempts today (UTC). Credit balance: ${data.credits}.` : 'Usage and paid credits will appear after the integration update.'}</p><p>20 free AI attempts per day. Once payments are authorized, a paid credit can cover an additional attempt, up to 100 total per day. Failed provider attempts count too.</p>
      {!plans.length && <p>No payment mode is connected. Owner approval, merchant account setup and plan prices are required first.</p>}
      {data.billing && plans.map(plan => <div className="connection-card" key={plan.id}><h3>{plan.label}</h3><p>{new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(plan.amount/100)} · {plan.credits} additional AI attempts</p><button className="primary" disabled={disabled} onClick={() => {void action(async () => {const result = await serverAction<{url:string}>('payment-checkout',{action:'checkout',planId:plan.id});const url = new URL(result.url);if (url.protocol !== 'https:' || url.hostname !== 'rzp.io' || url.username || url.password || url.port) throw new Error('Invalid checkout URL.');location.assign(url.toString())})}}>Continue to secure checkout</button></div>)}
    </div>
  </section>
}
