import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Summary = { users: number; drafts: number; approved: number; aiCallsToday: number; publishingEnabled: boolean; billingEnabled: boolean; observedAt: string }

export default function AdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)

    async function load() {
      try {
        if (!supabase) throw new Error()
        const result = await supabase.rpc('owner_monitoring').abortSignal(controller.signal)
        if (result.error || !result.data) throw new Error()
        const data = result.data as Summary
        if (![data.users, data.drafts, data.approved, data.aiCallsToday].every(n => Number.isSafeInteger(n) && n >= 0) || typeof data.publishingEnabled !== 'boolean' || typeof data.billingEnabled !== 'boolean' || !Number.isFinite(Date.parse(data.observedAt))) throw new Error()
        if (active) setSummary(data)
      } catch { if (active) setError(true) }
      finally { window.clearTimeout(timeout); if (active) setLoading(false) }
    }
    void load()
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [refresh])
  return <section className="content" aria-labelledby="admin-title"><div className="panel">
    <div className="panel-head"><h2 id="admin-title">Owner monitoring</h2><button className="ghost" disabled={loading} onClick={() => { setLoading(true); setSummary(null); setError(false); setRefresh(value => value + 1) }}>Refresh</button></div>
    {loading && <p role="status">Checking admin access…</p>}
    {error && <p role="alert">Monitoring unavailable. An active owner session and approved monitoring setup are required.</p>}
    {summary && <><p>Updated {new Date(summary.observedAt).toLocaleString()}. AI quota attempts use the UTC day; they are not a provider billing measurement.</p>
      <dl className="admin-metrics">{Object.entries({ Users: summary.users, Drafts: summary.drafts, Approved: summary.approved, 'AI calls today (UTC)': summary.aiCallsToday }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>Security alerts</h3><p role="status">{summary.publishingEnabled || summary.billingEnabled ? 'Attention: a publishing or billing database gate is open. Review configuration before Beta.' : 'Publishing and billing database gates are closed.'}</p>
      <h3>Costs, subscriptions and runtime errors</h3><p>Not instrumented. Billing remains outside the free Beta. Review provider spend and redacted hosted logs through authorized operator tools.</p>
      <p>This dashboard is read-only. Deployment, role changes, cleanup, billing and publishing require separate approval.</p></>}
  </div></section>
}

