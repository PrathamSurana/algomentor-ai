import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthSession } from './useAuthSession'

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }))
vi.mock('./supabase', () => ({ getSupabaseClient: getClient }))

const savedSession = {
  access_token: 'test-access-token',
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'learner@example.com' },
} as Session

function mockClient(session: Session | null = savedSession) {
  let notify: (event: string, session: Session | null) => void = () => undefined
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const getSession = vi.fn().mockResolvedValue({ data: { session }, error: null })
  const getUser = vi.fn().mockResolvedValue({ data: { user: session?.user ?? null }, error: null })
  const onAuthStateChange = vi.fn((callback: typeof notify) => {
    notify = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  const client = { auth: { getSession, getUser, signOut, onAuthStateChange } } as unknown as SupabaseClient
  getClient.mockReturnValue(client)
  return { notify: (event: string, next: Session | null) => notify(event, next), getSession, getUser, signOut }
}

beforeEach(() => getClient.mockReset())
afterEach(cleanup)

describe('Supabase session gate', () => {
  it('verifies a stored session before opening the application', async () => {
    const auth = mockClient()
    const { result } = renderHook(() => useAuthSession())
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    expect(auth.getUser).toHaveBeenCalledWith(savedSession.access_token)
    expect(result.current.state.session?.user.id).toBe(savedSession.user.id)
  })

  it('shows sign-in when no stored session exists and after sign-out', async () => {
    const auth = mockClient(null)
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'))
    auth.getUser.mockResolvedValueOnce({ data: { user: savedSession.user }, error: null })
    act(() => auth.notify('SIGNED_IN', savedSession))
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
    act(() => auth.notify('SIGNED_OUT', null))
    expect(result.current.state.status).toBe('signed_out')
  })

  it('rejects an expired stored session without exposing protected content', async () => {
    const auth = mockClient()
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } })
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'))
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('keeps a verification network failure on a retry screen', async () => {
    const auth = mockClient()
    auth.getUser.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'))
  })

  it('does not open protected content for an unverified sign-in event', async () => {
    const auth = mockClient(null)
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'))
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } })
    act(() => auth.notify('SIGNED_IN', savedSession))
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'))
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
