import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError } from './supabase'

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
  signOut: () => Promise<AuthActionResult>
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
  const [sessionAttempt, setSessionAttempt] = useState(0)

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
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        settled = true
        window.clearTimeout(timeoutId)
        setError(null)
        setUser(session?.user ?? null)
        setStatus(session ? 'authenticated' : 'unauthenticated')
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

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }

    setLoading(true)
    setError(null)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
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

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { notice: 'Supabase is not configured for this app.' }

    setLoading(true)
    setError(null)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
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
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setError(signOutError.message)
        return {}
      }
      setUser(null)
      setStatus('unauthenticated')
      return {}
    } catch (authError) {
      setError(messageFor(authError))
      return {}
    } finally {
      setLoading(false)
    }
  }, [])

  return { user, status, loading, error, signIn, signUp, signOut, retrySession }
}
