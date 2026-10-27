import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('authenticated Codeforces API integration', () => {
  it('sends the bearer token for analytics and preserves unavailable values', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      codeforces: null, kpis: { distinct_solves: null, submissions: null, rating: null, recent_events: null, streak_days: 0, verified_challenges: 0 },
      timeline: [], heatmap: [], topics: [], strengths: [], weaknesses: [], difficulty: [],
      difficulty_progression: [], rating_history: [], recommendations: [], roadmap: { nodes: [] },
      attempt_vs_accepted: { submissions: null, accepted_submissions: null, distinct_solves: null },
      recent_activity: [], insights: [], limitations: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getAnalytics } = await import('./api')
    const result = await getAnalytics('private-token', 'weekly')
    expect(result.kpis.distinct_solves).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/analytics?period=weekly')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer private-token')
  })

  it('syncs the linked account and reads its verified tree', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ handle: 'coder', has_more: false, new_submissions: 2, rating_history_status: 'ready' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ handle: 'coder', nodes: [], total_count: 38 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { syncLinkedCodeforcesHistory, getChallengeTree } = await import('./api')
    await syncLinkedCodeforcesHistory('token', 'coder')
    await getChallengeTree('token')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/platforms/codeforces/sync')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: 'coder', mode: 'refresh' })
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/roadmap/tree')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token')
  })

  it('reports invalid roadmap responses instead of rendering an empty graph', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ nodes: 'invalid' }), { status: 200 })))
    const { getChallengeTree } = await import('./api')
    await expect(getChallengeTree('token')).rejects.toThrow('invalid topic graph')
  })

  it('surfaces migration errors with their HTTP status', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'migration_required', message: 'Apply migration 006_roadmap_challenges.sql.' },
    }), { status: 503 })))
    const { getChallengeTree } = await import('./api')
    await expect(getChallengeTree('token')).rejects.toThrow('HTTP 503: Apply migration 006_roadmap_challenges.sql.')
  })

  it('distinguishes a timeout from an unreachable server', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { getChallengeTree } = await import('./api')
    await expect(getChallengeTree('token')).rejects.toThrow('timed out after 45 seconds')
    await expect(getChallengeTree('token')).rejects.toThrow('Could not connect to the API at https://api.example.test')
  })
})
