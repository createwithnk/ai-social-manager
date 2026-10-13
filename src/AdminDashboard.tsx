import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useLocale } from './lib/locale'

type Operations = {
  attempts: number; pending: number; errors: number; missingUsage: number; inputTokens: number; outputTokens: number
  estimatedUsd: number; committedUsd: number; carryoverUsd: number; clientErrors: number; aiEnabled: boolean; uploadsEnabled: boolean
  dailyCallLimit: number; dailyBudgetUsd: number
}
type Summary = { users: number; drafts: number; approved: number; aiCallsToday: number; publishingEnabled: boolean; billingEnabled: boolean; observedAt: string; operations?: Operations }
function validSummary(value: unknown): value is Summary {
  if (!value || typeof value !== 'object') return false
  const data = value as Summary
  if (![data.users,data.drafts,data.approved,data.aiCallsToday].every(n => Number.isSafeInteger(n) && n >= 0) ||
    typeof data.publishingEnabled !== 'boolean' || typeof data.billingEnabled !== 'boolean' || typeof data.observedAt !== 'string' || !Number.isFinite(Date.parse(data.observedAt))) return false
  if (data.operations !== undefined) {
    const ops = data.operations
    if (!ops || typeof ops !== 'object' || typeof ops.aiEnabled !== 'boolean' || typeof ops.uploadsEnabled !== 'boolean' ||
      ![ops.attempts,ops.pending,ops.errors,ops.missingUsage,ops.inputTokens,ops.outputTokens,ops.clientErrors,ops.dailyCallLimit].every(n => Number.isSafeInteger(n) && n >= 0) ||
      ![ops.estimatedUsd,ops.committedUsd,ops.carryoverUsd,ops.dailyBudgetUsd].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false
  }
  return true
}
export default function AdminDashboard() {
  const { t, locale } = useLocale()
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
        if (result.error || !validSummary(result.data)) throw new Error()
        if (active) setSummary(result.data)
      } catch { if (active) setError(true) }
      finally { window.clearTimeout(timeout); if (active) setLoading(false) }
    }
    void load()
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [refresh])
  const ops = summary?.operations
  const number = (value: number) => value.toLocaleString(locale)
  const usd = (value: number) => value.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 })
  const metrics: Record<string,string> = summary ? { Users: number(summary.users), Drafts: number(summary.drafts), Approved: number(summary.approved), 'AI calls today (UTC)': number(summary.aiCallsToday),
    ...(ops ? { 'Reserved requests': number(ops.attempts), 'Pending outcomes': number(ops.pending), 'AI errors': number(ops.errors), 'Missing usage': number(ops.missingUsage),
      'Input tokens': number(ops.inputTokens), 'Output and thinking tokens': number(ops.outputTokens), 'Estimated AI cost (USD)': usd(ops.estimatedUsd),
      'Committed budget (USD)': usd(ops.committedUsd), 'Unresolved prior-day budget (USD)': usd(ops.carryoverUsd), 'Daily budget (USD)': usd(ops.dailyBudgetUsd), 'Daily request limit': number(ops.dailyCallLimit), 'Client error reports': number(ops.clientErrors) } : {}) } : {}
  return <section className="content" aria-labelledby="admin-title"><div className="panel" aria-busy={loading}>
    <div className="panel-head"><h2 id="admin-title">{t('Owner monitoring')}</h2><button className="ghost" disabled={loading} onClick={() => { setLoading(true); setSummary(null); setError(false); setRefresh(value => value + 1) }}>{t('Refresh')}</button></div>
    {loading && <p role="status">{t('Checking admin access…')}</p>}
    {error && <p role="alert">{t('Monitoring unavailable. An active owner session and approved monitoring setup are required.')}</p>}
    {summary && <><p>{t('Updated')} <time dateTime={summary.observedAt}>{new Date(summary.observedAt).toLocaleString(locale)}</time></p>
      <p>{t('Counts use the UTC day. Quota attempts are not a provider billing measurement.')}</p>
      <dl className="admin-metrics">{Object.entries(metrics).map(([label,value]) => <div key={label}><dt>{t(label)}</dt><dd dir="auto">{value}</dd></div>)}</dl>
      <h3>{t('Security alerts')}</h3><p role="status">{t(summary.publishingEnabled || summary.billingEnabled ? 'Attention: a publishing or billing database gate is open. Review configuration before Beta.' : 'Publishing and billing database gates are closed.')}</p>
      {ops ? <><p>{t(ops.aiEnabled ? 'AI is enabled within the configured limits.' : 'AI is paused.')}</p><p>{t(ops.uploadsEnabled ? 'Uploads are enabled in the database. Review media safety before use.' : 'New uploads are disabled in the database.')}</p>
        {(ops.pending > 0 || ops.missingUsage > 0 || ops.carryoverUsd > 0) && <p role="status">{t('Unknown usage retains its full reservation. Check provider records before changing limits.')}</p>}
        <p>{t('Estimated cost uses configured rates and returned token usage. It is not an invoice or a guaranteed provider spend cap. Client error reports are untrusted counters.')}</p></> : <p>{t('Usage and error instrumentation awaits the approved Beta safety setup.')}</p>}
      <p>{t('Subscriptions and billing remain outside the free Beta.')}</p>
      <p>{t('This dashboard is read-only. Operational changes require separate approval.')}</p></>}
  </div></section>
}
