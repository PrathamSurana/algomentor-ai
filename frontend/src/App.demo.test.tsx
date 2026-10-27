import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import App from './App'

const { authHook, serviceCheck } = vi.hoisted(() => ({
  authHook: vi.fn(), serviceCheck: vi.fn(),
}))
vi.mock('./useAuthSession', () => ({ useAuthSession: authHook }))
vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  getServiceState: serviceCheck,
}))
vi.mock('./RoadmapPage', () => ({ default: ({ demoTree }: { demoTree?: { nodes: unknown[] } }) => <div>Demo tree: {demoTree?.nodes.length} topics</div> }))
vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const Leaf = () => <div />
  return { Area: Leaf, AreaChart: Wrapper, Bar: Leaf, BarChart: Wrapper, CartesianGrid: Leaf,
    Line: Leaf, LineChart: Wrapper, ResponsiveContainer: Wrapper, Tooltip: Leaf, XAxis: Leaf, YAxis: Leaf }
})

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  authHook.mockReturnValue({ client: null, state: { status: 'signed_out', session: null }, retry: vi.fn() })
  serviceCheck.mockReset()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Demo must not call a protected API') }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('evaluator demo access', () => {
  it('opens without Google, shows all pages, makes no API request, and exits to login', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Explore Demo/ }))
    await waitFor(() => expect(screen.getByText('Meet Demo Student')).toBeTruthy())
    expect(screen.getAllByText(/Demo Mode/).length).toBeGreaterThan(0)
    expect(screen.getByText('Illustrative rating · no account')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }))
    await waitFor(() => expect(screen.getByText('Demo tree: 38 topics')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('Sample recommendations · Demo Student')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))
    expect(screen.getByText('Prewritten example · Demo Mode')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Exit Demo' })[0])
    expect(screen.getByRole('button', { name: /Explore Demo/ })).toBeTruthy()
    expect(window.location.pathname).toBe('/')
    expect(serviceCheck).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
