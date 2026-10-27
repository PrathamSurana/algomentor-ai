import { describe, expect, it } from 'vitest'
import { buildDemoAnalytics, buildDemoRecommendations, buildDemoTree, demoChallengeKey, demoReview } from './demoData'

describe('isolated demonstration data', () => {
  it('contains 38 connected topics and genuine public problem identities', () => {
    const tree = buildDemoTree(new Set())
    expect(tree.nodes).toHaveLength(38)
    expect(tree.nodes.every((node) => node.challenges.length === 3)).toBe(true)
    expect(tree.nodes.some((node) => node.prerequisites.length > 1)).toBe(true)
    for (const node of tree.nodes) for (const challenge of node.challenges) {
      expect(challenge.url).toBe(`https://codeforces.com/problemset/problem/${challenge.contest_id}/${challenge.problem_index}`)
      expect(challenge.title.length).toBeGreaterThan(0)
      expect(challenge.rating).toBeGreaterThan(0)
    }
    expect(tree.nodes.find((node) => node.key === 'implementation')?.state).toBe('completed')
    expect(tree.nodes.find((node) => node.key === 'arrays')?.state).toBe('ready')
    expect(tree.nodes.find((node) => node.key === 'sorting')?.state).toBe('locked')
  })

  it('simulating the final Arrays challenge increases XP and unlocks connected topics', () => {
    const initial = buildDemoTree(new Set())
    const solved = buildDemoTree(new Set([demoChallengeKey('arrays', 'advanced')]))
    expect(solved.verified_challenges).toBe(initial.verified_challenges + 1)
    expect(solved.xp).toBe(initial.xp + 100)
    expect(solved.completed_count).toBe(initial.completed_count + 1)
    expect(solved.nodes.find((node) => node.key === 'arrays')?.state).toBe('completed')
    expect(solved.nodes.find((node) => node.key === 'sorting')?.state).toBe('ready')
    expect(solved.nodes.find((node) => node.key === 'prefix_sums')?.state).toBe('ready')
    expect(buildDemoTree(new Set())).toEqual(initial)
  })

  it('populates every demo chart and labels optional versus required practice', () => {
    const analytics = buildDemoAnalytics(new Set())
    expect(analytics.heatmap).toHaveLength(365)
    expect(analytics.timeline).toHaveLength(365)
    expect(analytics.rating_history.length).toBeGreaterThan(3)
    expect(analytics.topics.length).toBeGreaterThan(3)
    expect(analytics.difficulty.reduce((sum, item) => sum + item.count, 0)).toBe(analytics.kpis.distinct_solves)
    expect(analytics.heatmap.at(-1)?.cumulative_solves).toBe(analytics.kpis.distinct_solves)
    expect(analytics.heatmap.reduce((sum, day) => sum + (day.accepted_submissions ?? 0), 0)).toBe(analytics.attempt_vs_accepted.accepted_submissions)
    const afterSolve = buildDemoAnalytics(new Set([demoChallengeKey('arrays', 'advanced')]))
    expect(afterSolve.difficulty.reduce((sum, item) => sum + item.count, 0)).toBe(afterSolve.kpis.distinct_solves)
    expect(afterSolve.kpis.verified_challenges).toBe(analytics.kpis.verified_challenges + 1)
    expect(buildDemoAnalytics(new Set(), 'weekly').timeline.length).toBeGreaterThan(40)
    const recs = buildDemoRecommendations(analytics.roadmap).recommendations
    expect(recs.some((item) => (item as {category?: string}).category === 'mandatory_roadmap')).toBe(true)
    expect(recs.some((item) => (item as {category?: string}).category === 'optional_practice')).toBe(true)
    expect(analytics.limitations.join(' ')).toContain('Demonstration data only')
    expect(demoReview.provider).toBe('demo_example')
  })
})
