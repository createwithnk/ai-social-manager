import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError } from './supabase'
import { authRedirect, recoveryMarker, validateNewPassword } from './auth-flows'
import { captchaOptions } from './captcha'
import { captchaConfig } from './captcha-config'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured' | 'error'

export interface AuthActionResult {
  notice?: string
  ok?: boolean
}

export interface AuthState {
  user: User | null
  status: AuthStatus
  loading: boolean
  error: string | null
  notice: string | null
  recovering: boolean
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthActionResult>
  signUp: (email: string, password: string, captchaToken?: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
  resetPassword: (email: string, captchaToken?: string) => Promise<AuthActionResult>
  resendConfirmation: (email: string, captchaToken?: string) => Promise<AuthActionResult>
  updatePassword: (password: string) => Promise<AuthActionResult>
  retrySession: () => void
}

const SESSION_BOOTSTRAP_TIMEOUT_MS = 10_000

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function sessionBootstrapMessage(error?: unknown) {
  const detail = error ? ` ${messageFor(error)}` : ''
  return `We couldn’t check your session.${detail} Check your connection and Supabase configuration, then retry.`
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (supabase) return 'loading'
    return supabaseConfigurationError ? 'error' : 'unconfigured'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(supabaseConfigurationError)
  const [notice, setNotice] = useState<string | null>(null)
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let active = true
    let settled = false
    const finishWithError = (sessionError?: unknown) => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeoutId)
      setUser(null)
      setError(sessionBootstrapMessage(sessionError))
      setStatus('error')
    }
    const timeoutId = window.setTimeout(() => {
      finishWithError()
    }, SESSION_BOOTSTRAP_TIMEOUT_MS)

    try {
      void supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active || settled) return
        settled = true
        window.clearTimeout(timeoutId)
        if (sessionError) {
          setUser(null)
          setError(sessionBootstrapMessage(sessionError))
          setStatus('error')
          return
        }
        setError(null)
        setUser(data.session?.user ?? null)
        setStatus(data.session ? 'authenticated' : 'unauthenticated')
      }).catch((sessionError) => {
        finishWithError(sessionError)
      })
    } catch (sessionError) {
      finishWithError(sessionError)
    }

    let unsubscribe: (() => void) | undefined
    try {
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return
        settled = true
        window.clearTimeout(timeoutId)
        setError(null)
        setUser(session?.user ?? null)
        setStatus(session ? 'authenticated' : 'unauthenticated')
        if (!session) setRecovering(false)
        else {
          if (event === 'PASSWORD_RECOVERY') {
            recoveryMarker(session.user.id,Date.now() + 10 * 60_000)
            setRecovering(true)
          } else setRecovering(recoveryMarker(session.user.id))
        }
      })
      unsubscribe = () => listener.subscription.unsubscribe()
    } catch (sessionError) {
      finishWithError(sessionError)
    }

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      unsubscribe?.()
    }
  }, [sessionAttempt])

  const retrySession = useCallback(() => {
    if (!supabase) {
      if (supabaseConfigurationError) {
        setError(supabaseConfigurationError)
        setStatus('error')
      }
      return
    }

    setError(null)
    setStatus('loading')
    setSessionAttempt((attempt) => attempt + 1)
  }, [])

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }

    setLoading(true)
    setError(null)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password, options: captchaOptions(captchaConfig,captchaToken) })
      if (signInError) {
        setError(signInError.message)
        return {}
      }
      setUser(data.user)
      setStatus('authenticated')
      return {}
    } catch (authError) {
      setError(messageFor(authError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, captchaToken?: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }

    setLoading(true)
    setError(null)
    try {
      validateNewPassword(password)
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password,
        options: { emailRedirectTo: authRedirect('confirmed'), ...captchaOptions(captchaConfig,captchaToken) },
      })
      if (signUpError) {
        setError(signUpError.message)
        return {}
      }
      if (data.session) {
        setUser(data.user)
        setStatus('authenticated')
        return {}
      }
      setStatus('unauthenticated')
      return { notice: 'Check your email to confirm your account, then sign in.' }
    } catch (authError) {
      setError(messageFor(authError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return {}

    setLoading(true)
    setError(null)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
      if (signOutError) {
        setError(signOutError.message)
        return {}
      }
      if (user) recoveryMarker(user.id,null)
      setRecovering(false)
      setUser(null)
      setStatus('unauthenticated')
      return {}
    } catch (authError) {
      setError(messageFor(authError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [user])

  const emailAction = useCallback(async (email: string, action: 'reset' | 'confirm', captchaToken?: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Account service is not configured.' }
    setLoading(true); setError(null)
    try {
      const response = action === 'reset'
        ? await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect('recovery'), ...captchaOptions(captchaConfig,captchaToken) })
        : await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authRedirect('confirmed'), ...captchaOptions(captchaConfig,captchaToken) } })
      if (response.error) throw response.error
      return { ok: true, notice: 'If this account can receive the email, a link has been sent. Open it in this browser. Check spam too.' }
    } catch {
      return { notice: 'The email request could not be completed. Wait before retrying. Contact the site owner if it continues.' }
    } finally { setLoading(false) }
  }, [])

  const resetPassword = useCallback((email: string, captchaToken?: string) => emailAction(email, 'reset', captchaToken), [emailAction])
  const resendConfirmation = useCallback((email: string, captchaToken?: string) => emailAction(email, 'confirm', captchaToken), [emailAction])
  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (!supabase || !user || !recovering) return { notice: 'Open a new password reset link first.' }
    setLoading(true); setError(null)
    try {
      validateNewPassword(password)
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      const { error: revokeError } = await supabase.auth.signOut({ scope: 'global' })
      if (revokeError) return { ok: true, notice: 'Password updated, but signing out other devices failed. Choose Cancel and log out to retry.' }
      recoveryMarker(user.id,null)
      setRecovering(false); setUser(null); setStatus('unauthenticated')
      setNotice('Password updated. Sign in again with your new password.')
      return { ok: true, notice: 'Password updated. Sign in again with your new password.' }
    } catch (updateError) {
      setError(messageFor(updateError)); return {}
    } finally { setLoading(false) }
  }, [user, recovering])

  return { user, status, loading, error, notice, recovering, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword, retrySession }
}
