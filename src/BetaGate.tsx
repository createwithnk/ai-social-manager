import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase'
import { useLocale } from './lib/locale'
import LanguageSwitcher from './LanguageSwitcher'
import type { AuthState } from './lib/auth'
import AdminDashboard from './AdminDashboard'

export default function BetaGate({ auth, children }: { auth: AuthState; children: ReactNode }) {
  const { t } = useLocale()
  const [state, setState] = useState<'checking' | 'allowed' | 'denied' | 'unavailable'>('checking')
  const [attempt, setAttempt] = useState(0)
  const [monitoring, setMonitoring] = useState(false)
  useEffect(() => {
    let active = true
    let controller: AbortController | undefined
    let timer: number | undefined
    async function check() {
      if (controller) return
      controller = new AbortController()
      timer = window.setTimeout(() => controller?.abort(), 10000)
      try {
        if (!supabase) throw new Error()
        const { data, error } = await supabase.rpc('beta_access').abortSignal(controller.signal)
        if (active) setState(error || typeof data !== 'boolean' ? 'unavailable' : data ? 'allowed' : 'denied')
      } catch { if (active) setState('unavailable') }
      finally { window.clearTimeout(timer); controller = undefined }
    }
    void check()
    const focus = () => { void check() }
    const interval = window.setInterval(focus,60000)
    window.addEventListener('focus',focus)
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener('focus',focus) }
  }, [attempt])
  if (state === 'allowed') return children
  return <main className="auth-shell"><section className="auth-card"><LanguageSwitcher /><h1>{t('UAE Private Beta')}</h1>
    <p role={state === 'checking' ? 'status' : 'alert'}>{t(state === 'checking' ? 'Checking your Beta invitation…' : state === 'unavailable' ? 'Beta access could not be verified. Check your connection and retry.' : 'An active invitation is required. Contact the owner if you were invited.')}</p>
    <button className="primary wide" disabled={state === 'checking'} onClick={() => { setState('checking'); setAttempt(value => value + 1) }}>{t('Retry access check')}</button>
    <button className="ghost" disabled={auth.loading} onClick={() => { void auth.signOut() }}>{t('Log out')}</button>
    {auth.error && <p role="alert">{t(auth.error)}</p>}
    <button className="ghost" onClick={() => setMonitoring(value => !value)}>{t('Owner monitoring')}</button>
    {monitoring && <AdminDashboard />}
  </section></main>
}
