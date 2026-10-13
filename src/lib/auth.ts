import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError, isInvitationCallback } from './supabase'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured' | 'error'

export interface AuthActionResult {
  notice?: string
}

export interface AuthState {
  user: User | null
  status: AuthStatus
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signUp: (email: string, password: string) => Promise<AuthActionResult>
  requestPasswordReset: (email: string) => Promise<AuthActionResult>
  updatePassword: (password: string) => Promise<AuthActionResult>
  recoveryMode: boolean
  exitRecovery: () => void
  signOut: () => Promise<AuthActionResult>
  retrySession: () => void
}

const SESSION_BOOTSTRAP_TIMEOUT_MS = 10_000

function messageFor(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === 'invalid_credentials') return 'Sign-in failed. Check your email and password or try again later.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many authentication attempts. Please wait and retry.'
  if (code === 'weak_password' || code === 'same_password') return 'Choose a new, stronger password between 12 and 128 characters.'
  return 'Authentication is unavailable. Please retry.'
}

function sessionBootstrapMessage() {
  return 'We couldn’t check your session. Check your connection and retry.'
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (supabase) return 'loading'
    return supabaseConfigurationError ? 'error' : 'unconfigured'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(supabaseConfigurationError)
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const [recoveryMode, setRecoveryMode] = useState(Boolean(isInvitationCallback))

  useEffect(() => {
    if (!supabase) return

    let active = true
    let settled = false
    const finishWithError = () => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeoutId)
      setUser(null)
      setError(sessionBootstrapMessage())
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
          setError(sessionBootstrapMessage())
          setStatus('error')
          return
        }
        setError(null)
        setUser(data.session?.user ?? null)
        setStatus(data.session ? 'authenticated' : 'unauthenticated')
      }).catch(() => {
        finishWithError()
      })
    } catch {
      finishWithError()
    }

    let unsubscribe: (() => void) | undefined
    try {
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
        if (event === 'SIGNED_OUT') setRecoveryMode(false)
        settled = true
        window.clearTimeout(timeoutId)
        setError(null)
        setUser(session?.user ?? null)
        setStatus(session ? 'authenticated' : 'unauthenticated')
      })
      unsubscribe = () => listener.subscription.unsubscribe()
    } catch {
      finishWithError()
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

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }

    setLoading(true)
    setError(null)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(messageFor(signInError))
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

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    void email; void password
    return { notice: 'The Private Beta is invite-only. Contact the owner for access.' }
  }, [])
  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return { notice: 'Enter your email address first.' }
    setLoading(true)
    setError(null)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: window.location.origin + window.location.pathname })
      if (resetError) {
        setError(messageFor(resetError))
        return {}
      }
      return { notice: 'If an account exists for this email, a password reset link will be sent.' }
    } catch (resetError) {
      setError(messageFor(resetError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }
    if (password.length < 12 || password.length > 128) {
      setError('Use a password between 12 and 128 characters.')
      return {}
    }
    setLoading(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(messageFor(updateError))
        return {}
      }
      return { notice: 'Your password has been updated successfully.' }
    } catch (updateError) {
      setError(messageFor(updateError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  const exitRecovery = useCallback(() => setRecoveryMode(false), [])

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return {}

    setLoading(true)
    setError(null)
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setError(messageFor(signOutError))
        return {}
      }
      setUser(null)
      setRecoveryMode(false)
      setStatus('unauthenticated')
      return {}
    } catch (authError) {
      setError(messageFor(authError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  return { user, status, loading, error, signIn, signUp, requestPasswordReset, updatePassword, recoveryMode, exitRecovery, signOut, retrySession }
}
