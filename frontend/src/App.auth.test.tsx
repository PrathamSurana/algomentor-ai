import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const { authHook, serviceCheck } = vi.hoisted(() => ({
  authHook: vi.fn(),
  serviceCheck: vi.fn().mockResolvedValue({ kind: 'ready' }),
}))
vi.mock('./useAuthSession', () => ({ useAuthSession: authHook }))
vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  getServiceState: serviceCheck,
}))
vi.mock('./RoadmapPage', () => ({ default: ({ session }: { session: Session }) => <div>Roadmap for {session.user.id}</div> }))
vi.mock('./ReviewPage', () => ({ default: () => <div>Private review page</div> }))

const session = {
  access_token: 'test-token',
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'learner@example.com', user_metadata: {} },
} as Session
const client = { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } } as unknown as SupabaseClient

beforeEach(() => {
  authHook.mockReset()
  serviceCheck.mockClear()
  window.history.replaceState({}, '', '/')
})
afterEach(cleanup)

describe('top-level route protection', () => {
  it.each(['/','/recommendations','/roadmap','/review'])(
    'shows login, not the dashboard, for a logged-out direct visit to %s', (path) => {
      window.history.replaceState({}, '', path)
      authHook.mockReturnValue({ client, state: { status: 'signed_out', session: null }, retry: vi.fn() })
      render(<App />)
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy()
      expect(screen.queryByRole('navigation', { name: /dashboard navigation/i })).toBeNull()
      expect(window.location.pathname).toBe(path)
    },
  )

  it('restores a successful OAuth callback to the intended protected page', async () => {
    window.history.replaceState({}, '', '/auth/callback?next=%2Froadmap')
    authHook.mockReturnValue({ client, state: { status: 'authenticated', session }, retry: vi.fn() })
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/roadmap'))
    expect(screen.getByText(`Roadmap for ${session.user.id}`)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: /dashboard navigation/i })).toBeTruthy()
  })

  it('does not show login again for an authenticated direct visit', () => {
    window.history.replaceState({}, '', '/review')
    authHook.mockReturnValue({ client, state: { status: 'authenticated', session }, retry: vi.fn() })
    render(<App />)
    expect(screen.getByText('Private review page')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull()
  })

  it('signs out from the profile menu and returns to the root route', async () => {
    window.history.replaceState({}, '', '/roadmap')
    authHook.mockReturnValue({ client, state: { status: 'authenticated', session }, retry: vi.fn() })
    render(<App />)
    fireEvent.click(screen.getAllByText('learner@example.com')[0].closest('summary')!)
    fireEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0])
    await waitFor(() => expect(client.auth.signOut).toHaveBeenCalled())
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })
})
