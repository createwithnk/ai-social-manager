import { useState } from 'react'
import { LoaderCircle, WandSparkles } from 'lucide-react'
import type { AuthState } from '../lib/auth'
import { minimumPasswordLength } from '../lib/auth-flows'

export function AuthScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'confirm'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(() => new URLSearchParams(location.search).has('error') ? 'This account link expired or could not be used. Request a new link.' : null)
  const [nextEmailRequest, setNextEmailRequest] = useState(0)
  const emailOnly = mode === 'reset' || mode === 'confirm'
  const title = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password', confirm: 'Confirm your email' }[mode]
  const button = { login: 'Log in', signup: 'Sign up', reset: 'Send reset link', confirm: 'Resend confirmation' }[mode]
  function changeMode(value: typeof mode) { setMode(value); setNotice(null); setPassword('') }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null)
    if (emailOnly && Date.now() < nextEmailRequest) { setNotice('Please wait one minute before requesting another email.'); return }
    const result = mode === 'login' ? await auth.signIn(email, password)
      : mode === 'signup' ? await auth.signUp(email, password)
      : mode === 'reset' ? await auth.resetPassword(email) : await auth.resendConfirmation(email)
    if (emailOnly) setNextEmailRequest(Date.now() + 60_000)
    setNotice(result.notice ?? null)
    if (result.notice) setPassword('')
  }
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title">
    <div className="brand auth-brand"><div className="brand-mark"><WandSparkles size={20} /></div><div><strong>AasiFlowAI</strong><small>Content workspace</small></div></div>
    <span className="eyebrow">SECURE WORKSPACE</span><h1 id="auth-title">{title}</h1>
    <p>{emailOnly ? 'Open the email link in this browser to finish. Links expire and can be used once.' : 'Your drafts and attachments belong to your signed-in account.'}</p>
    <form onSubmit={submit}><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required disabled={auth.loading} /></label>
      {!emailOnly && <label>Password<input type="password" aria-label="Password" aria-describedby={mode === 'signup' ? 'password-hint' : undefined} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? minimumPasswordLength : 1} maxLength={128} required disabled={auth.loading} />{mode === 'signup' && <small id="password-hint">At least 12 characters. A unique passphrase is easier to remember.</small>}</label>}
      {auth.error && !emailOnly && <p className="form-error" role="alert">{auth.error}</p>}{(notice || auth.notice) && <p className="form-notice" role="status">{notice || auth.notice}</p>}
      <button className="primary wide" disabled={auth.loading}>{auth.loading ? <><LoaderCircle className="spinner" /> Please wait</> : button}</button>
    </form>
    {mode === 'login' && <button className="auth-switch" onClick={() => changeMode('reset')} disabled={auth.loading}>Forgot password?</button>}
    <button className="auth-switch" onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')} disabled={auth.loading}>{mode === 'login' ? 'Need an account? Sign up' : 'Back to log in'}</button>
    {(mode === 'login' || mode === 'signup') && <button className="auth-switch" onClick={() => changeMode('confirm')} disabled={auth.loading}>Resend confirmation email</button>}
  </section></main>
}

export function PasswordRecoveryScreen({ auth }: { auth: AuthState }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice('')
    if (password !== confirm) { setNotice('The passwords do not match.'); return }
    const result = await auth.updatePassword(password)
    setNotice(result.notice ?? '')
    if (result.ok) { setPassword(''); setConfirm('') }
  }
  return <main className="auth-shell"><section className="auth-card"><h1>Choose a new password</h1><p>Use a unique passphrase. After updating, sign in again; other device sessions are signed out.</p><form onSubmit={submit}>
    <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={minimumPasswordLength} maxLength={128} autoComplete="new-password" required disabled={auth.loading} /></label>
    <label>Confirm new password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={minimumPasswordLength} maxLength={128} autoComplete="new-password" required disabled={auth.loading} /></label>
    {(auth.error || notice) && <p role="alert" className="form-error">{auth.error || notice}</p>}
    <button className="primary wide" disabled={auth.loading}>{auth.loading ? 'Updating…' : 'Update password'}</button></form>
    <button className="auth-switch" disabled={auth.loading} onClick={() => { void auth.signOut() }}>Cancel and log out</button>
  </section></main>
}
