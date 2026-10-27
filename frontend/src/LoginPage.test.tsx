import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import LoginPage from './LoginPage'

afterEach(cleanup)

function client() {
  const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: 'https://example.com/auth' }, error: null })
  const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null })
  return {
    value: { auth: { signInWithOAuth, signInWithOtp } } as unknown as SupabaseClient,
    signInWithOAuth,
    signInWithOtp,
  }
}

describe('login screen', () => {
  it('starts Google OAuth only when the user clicks the primary button', async () => {
    const auth = client()
    render(<LoginPage client={auth.value} returnTo="/roadmap" initialError={null} />)
    expect(screen.getByRole('heading', { name: /personalized ai coding coach/i })).toBeTruthy()
    expect(auth.signInWithOAuth).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:5173/auth/callback?next=%2Froadmap' },
    }))
  })

  it('keeps email magic-link sign-in available as a secondary method', async () => {
    const auth = client()
    render(<LoginPage client={auth.value} returnTo="/review" initialError={null} />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'learner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send email sign-in link/i }))
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'learner@example.com',
      options: { emailRedirectTo: 'http://localhost:5173/auth/callback?next=%2Freview' },
    }))
    expect(screen.getByText(/check your inbox/i)).toBeTruthy()
  })

  it('shows provider failures without opening the dashboard', async () => {
    const auth = client()
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: new Error('Provider is disabled') })
    render(<LoginPage client={auth.value} returnTo="/" initialError={null} />)
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Provider is disabled'))
  })

  it('explains missing public Supabase configuration', () => {
    render(<LoginPage client={null} returnTo="/" initialError={null} />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert')).toHaveProperty('textContent', expect.stringContaining('not configured'))
  })
})
