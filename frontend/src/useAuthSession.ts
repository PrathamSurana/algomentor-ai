import { useEffect, useState } from 'react'
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

export type AuthState =
  | { status: 'loading'; session: null; message?: string }
  | { status: 'signed_out'; session: null }
  | { status: 'authenticated'; session: Session }
  | { status: 'error'; session: null; message: string }

function invalidSession(error: AuthError): boolean {
  return error.status === 400 || error.status === 401 || error.status === 403
}

export function useAuthSession(): {
  client: SupabaseClient | null
  state: AuthState
  retry: () => void
} {
  const client = getSupabaseClient()
  const [state, setState] = useState<AuthState>(
    client ? { status: 'loading', session: null } : { status: 'signed_out', session: null },
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    let authEventVersion = 0
    async function verify(session: Session, version: number) {
      try {
        const { data, error } = await client!.auth.getUser(session.access_token)
        if (!active || version !== authEventVersion) return
        if (error || !data.user || data.user.id !== session.user.id) {
          if (error && !invalidSession(error)) {
            setState({ status: 'error', session: null, message: 'Could not verify your session. Check your connection and retry.' })
          } else {
            await client!.auth.signOut({ scope: 'local' })
            if (active && version === authEventVersion) setState({ status: 'signed_out', session: null })
          }
          return
        }
        setState({ status: 'authenticated', session: { ...session, user: data.user } })
      } catch {
        if (active && version === authEventVersion) {
          setState({ status: 'error', session: null, message: 'Authentication is unavailable. Check your connection and retry.' })
        }
      }
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return
      authEventVersion += 1
      if (event === 'SIGNED_OUT') {
        setState({ status: 'signed_out', session: null })
      } else if (session && (
        event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'
      )) {
        setState({ status: 'loading', session: null })
        void verify(session, authEventVersion)
      }
    })

    const version = authEventVersion
    async function restore() {
      try {
        const { data, error } = await client!.auth.getSession()
        if (!active || version !== authEventVersion) return
        if (error) {
          if (invalidSession(error)) {
            await client!.auth.signOut({ scope: 'local' })
            if (active) setState({ status: 'signed_out', session: null })
          } else {
            setState({ status: 'error', session: null, message: 'Could not restore your session. Check your connection and retry.' })
          }
          return
        }
        if (!data.session) {
          setState({ status: 'signed_out', session: null })
          return
        }
        await verify(data.session, version)
      } catch {
        if (active && version === authEventVersion) {
          setState({ status: 'error', session: null, message: 'Authentication is unavailable. Check your connection and retry.' })
        }
      }
    }
    void restore()
    return () => { active = false; subscription.unsubscribe() }
  }, [client, attempt])

  function retry() {
    setState(client ? { status: 'loading', session: null } : { status: 'signed_out', session: null })
    setAttempt((value) => value + 1)
  }

  return { client, state, retry }
}
