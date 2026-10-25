import { Component, useEffect, type ReactNode } from 'react'
import { reportRuntimeError } from './lib/monitoring'
import { useLocale } from './lib/locale'

export function RuntimeMonitoring() {
  useEffect(() => {
    const error = () => { void reportRuntimeError('unhandled_error') }
    const rejection = () => { void reportRuntimeError('unhandled_rejection') }
    window.addEventListener('error', error)
    window.addEventListener('unhandledrejection', rejection)
    return () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection) }
  }, [])
  return null
}
function Recovery() {
  const { t } = useLocale()
  return <main className="auth-shell"><section className="auth-card"><h1>{t('The workspace could not be displayed.')}</h1><p role="alert">{t('Reload to recover. Unsaved edits may be lost.')}</p><button className="primary wide" onClick={() => window.location.reload()}>{t('Reload workspace')}</button></section></main>
}
export default class RuntimeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { void reportRuntimeError('render_failed') }
  render() { return this.state.failed ? <Recovery /> : this.props.children }
}
