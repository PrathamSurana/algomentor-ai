import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import RoadmapPage from './RoadmapPage'
import { buildDemoTree } from './demoData'

const getChallengeTree = vi.fn()
const syncLinkedCodeforcesHistory = vi.fn()
vi.mock('./api', () => ({
  getChallengeTree: (...args: unknown[]) => getChallengeTree(...args),
  syncLinkedCodeforcesHistory: (...args: unknown[]) => syncLinkedCodeforcesHistory(...args),
}))
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactFlow: ({ nodes, edges, onNodeClick, children, colorMode }: {
    nodes: { id: string; measured?: { width: number; height: number }; data: { topic: { title: string } } }[]
    edges: { id: string }[]
    onNodeClick: (event: unknown, node: unknown) => void
    children: ReactNode
    colorMode: string
  }) => <div data-color-mode={colorMode}><div data-testid="graph">{nodes.map((node) => <button key={node.id} data-measured-width={node.measured?.width} onClick={() => onNodeClick({}, node)}>{node.data.topic.title}</button>)}{edges.map((edge) => <span key={edge.id} data-testid="prerequisite-edge">{edge.id}</span>)}</div>{children}</div>,
  Background: () => null, Controls: () => <div data-testid="flow-controls" />, Handle: () => null,
  MiniMap: ({ bgColor, style }: { bgColor: string; style: { width: number; height: number } }) => <div data-testid="flow-minimap" data-background={bgColor} data-width={style.width} data-height={style.height} />,
  MarkerType: { ArrowClosed: 'arrowclosed' }, Position: { Left: 'left', Right: 'right' },
}))

const challenge = (verified: boolean) => ({
  tier: 'beginner', contest_id: 100, problem_index: 'A', title: 'Real catalog problem', rating: 800,
  tags: ['implementation'], url: 'https://codeforces.com/problemset/problem/100/A',
  verified, solved_at: verified ? '2026-10-26T00:00:00Z' : null, required: true,
})
const node = (key: string, state: 'ready' | 'locked' | 'completed', verified: number) => ({
  key, title: key === 'implementation' ? 'Basic Implementation' : 'Arrays', pathway: 'Foundations',
  prerequisites: key === 'arrays' ? ['implementation'] : [],
  missing_prerequisites: state === 'locked' ? ['implementation'] : [],
  codeforces_tag: 'implementation', state, verified_count: verified, required_count: 3,
  xp: verified * 100, rank: 'beginner', completed_at: state === 'completed' ? '2026-10-26T00:00:00Z' : null,
  challenges: key === 'implementation' ? [challenge(verified > 0)] : [],
})
const tree = (unlocked: boolean) => ({
  handle: 'coder', synced_at: '2026-10-26T00:00:00Z', sync_status: 'ready',
  nodes: [node('implementation', unlocked ? 'completed' : 'ready', unlocked ? 3 : 2), node('arrays', unlocked ? 'ready' : 'locked', 0)],
  completed_count: unlocked ? 1 : 0, total_count: 2, verified_challenges: unlocked ? 3 : 2,
  xp: unlocked ? 300 : 200, streak_days: 1, recommended_key: unlocked ? 'arrays' : 'implementation', achievements: [],
})
const session = { access_token: 'token' } as Session

afterEach(() => { cleanup(); getChallengeTree.mockReset(); syncLinkedCodeforcesHistory.mockReset() })

describe('verified roadmap page', () => {
  it('uses only local demo state for a 38-topic simulated unlock', async () => {
    const solve = vi.fn()
    const initial = buildDemoTree(new Set())
    const view = render(<RoadmapPage session={null} demoTree={initial} onDemoSolve={solve} onOpenOverview={vi.fn()} />)
    expect(screen.getByTestId('graph').querySelectorAll('button')).toHaveLength(38)
    expect(screen.getAllByTestId('prerequisite-edge').length).toBeGreaterThan(38)
    expect(screen.getByTestId('graph').parentElement?.getAttribute('data-color-mode')).toBe('dark')
    expect(screen.getByTestId('flow-controls')).toBeTruthy()
    expect(screen.getByTestId('flow-minimap').getAttribute('data-background')).toBe('#151522')
    expect(screen.getByTestId('flow-minimap').getAttribute('data-width')).toBe('140')
    expect(screen.getByRole('button', { name: 'Basic Implementation' }).getAttribute('data-measured-width')).toBe('236')
    fireEvent.click(screen.getByRole('button', { name: 'Sorting' }))
    expect(screen.getByText(/Locked until Arrays/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Accepted Submission' }))
    expect(solve).toHaveBeenCalledWith('arrays', 'advanced')
    expect(getChallengeTree).not.toHaveBeenCalled()
    expect(syncLinkedCodeforcesHistory).not.toHaveBeenCalled()
    view.rerender(<RoadmapPage session={null} demoTree={buildDemoTree(new Set(['arrays:advanced']))} onDemoSolve={solve} onOpenOverview={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sorting' }))
    await waitFor(() => expect(screen.queryByText(/Locked until Arrays/)).toBeNull())
  })

  it('shows a useful API failure and retry control', async () => {
    getChallengeTree.mockRejectedValue(new Error('HTTP 503: Apply migration 006_roadmap_challenges.sql.'))
    render(<RoadmapPage session={session} onOpenOverview={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 503: Apply migration 006_roadmap_challenges.sql.'))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('loads a branching graph and shows a selected topic’s official challenge', async () => {
    getChallengeTree.mockResolvedValue(tree(false))
    render(<RoadmapPage session={session} onOpenOverview={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('graph')).toBeTruthy())
    expect(screen.getAllByTestId('prerequisite-edge')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Real catalog problem/ }).getAttribute('href')).toBe('https://codeforces.com/problemset/problem/100/A')
    fireEvent.click(screen.getByRole('button', { name: 'Arrays' }))
    expect(screen.getByText(/Locked until Basic Implementation/)).toBeTruthy()
  })

  it('refreshes verified progress and unlocks a dependent topic after sync', async () => {
    getChallengeTree.mockResolvedValueOnce(tree(false)).mockResolvedValue(tree(true))
    syncLinkedCodeforcesHistory.mockResolvedValue({ new_submissions: 1, has_more: false })
    render(<RoadmapPage session={session} onOpenOverview={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('graph')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Sync Progress/ }))
    await waitFor(() => expect(getChallengeTree).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Arrays' }))
    await waitFor(() => expect(screen.queryByText(/Locked until Basic Implementation/)).toBeNull())
    expect(syncLinkedCodeforcesHistory).toHaveBeenCalledWith('token', 'coder', 'refresh', expect.any(Function))
  })
})
