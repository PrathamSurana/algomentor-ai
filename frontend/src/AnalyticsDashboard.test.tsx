import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import AnalyticsDashboard from './AnalyticsDashboard'

const getAnalytics = vi.fn()
vi.mock('./api', () => ({ getAnalytics: (...args: unknown[]) => getAnalytics(...args) }))
vi.mock('./CodeforcesPanel', () => ({ default: () => <div>Codeforces connection</div> }))
vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const Leaf = () => <div />
  return {
    Area: Leaf, AreaChart: Wrapper, Bar: Leaf, BarChart: Wrapper,
    CartesianGrid: Leaf, Line: Leaf, LineChart: Wrapper,
    ResponsiveContainer: Wrapper, Tooltip: Leaf, XAxis: Leaf, YAxis: Leaf,
  }
})

const session = { access_token: 'token' } as Session
const props = { session, onOpenRecommendations: vi.fn(), onOpenRoadmap: vi.fn() }
const empty = {
  codeforces: null,
  kpis: { distinct_solves: null, submissions: null, rating: null, recent_events: null, streak_days: 0, verified_challenges: 0 },
  timeline: [], heatmap: [], topics: [], strengths: [], weaknesses: [], difficulty: [],
  difficulty_progression: [], rating_history: [], recommendations: [],
  roadmap: { nodes: [], completed_count: 0, total_count: 38, verified_challenges: 0, xp: 0, recommended_key: null },
  attempt_vs_accepted: { submissions: null, accepted_submissions: null, distinct_solves: null },
  recent_activity: [], insights: [], limitations: [],
}

afterEach(() => { cleanup(); getAnalytics.mockReset() })

describe('analytics dashboard states', () => {
  it('shows loading and then the unlinked empty state', async () => {
    let resolve!: (value: typeof empty) => void
    getAnalytics.mockReturnValue(new Promise((done) => { resolve = done }))
    render(<AnalyticsDashboard {...props} />)
    expect(screen.getByRole('status').textContent).toContain('Loading Codeforces analytics')
    resolve(empty)
    await waitFor(() => expect(screen.queryByText('Loading Codeforces analytics')).toBeNull())
    expect(screen.getByText('Codeforces connection')).toBeTruthy()
    expect(screen.queryByText('Distinct solves')).toBeNull()
  })

  it('renders a ready dashboard with only stored values', async () => {
    getAnalytics.mockResolvedValue({
      ...empty,
      codeforces: { handle: 'coder', synced_at: '2026-10-26T00:00:00Z', has_more: false },
      kpis: { ...empty.kpis, distinct_solves: 3, submissions: 5, rating: 1200, recent_events: 1 },
    })
    render(<AnalyticsDashboard {...props} />)
    await waitFor(() => expect(screen.getByText('1,200')).toBeTruthy())
    expect(screen.getByText('1,200')).toBeTruthy()
    expect(screen.getByText('Accepted problems, deduplicated')).toBeTruthy()
  })

  it('shows the API failure with a retry action', async () => {
    getAnalytics.mockRejectedValue(new Error('Analytics data is unavailable'))
    render(<AnalyticsDashboard {...props} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Analytics data is unavailable'))
    expect(screen.getByText('Retry')).toBeTruthy()
  })
})
