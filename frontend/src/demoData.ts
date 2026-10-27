import type { AnalyticsResponse, Challenge, ChallengeNode, ChallengeTree, RecommendationsResponse, ReviewDetail } from './api'
import catalogJson from './demoCatalog.json'
import extrasJson from './demoExtras.json'

type SeedChallenge = Omit<Challenge, 'verified' | 'solved_at' | 'required'>
type SeedTopic = Pick<ChallengeNode, 'key' | 'title' | 'pathway' | 'prerequisites' | 'codeforces_tag'> & { challenges: SeedChallenge[] }
const topics = catalogJson as SeedTopic[]
const extras = extrasJson
const INITIAL_SOLVED = new Set([
  'implementation:beginner', 'implementation:intermediate', 'implementation:advanced',
  'strings:beginner', 'strings:intermediate', 'strings:advanced',
  'arrays:beginner', 'arrays:intermediate', 'math_basics:beginner',
])
const tierOrder = ['beginner', 'intermediate', 'advanced']

export function demoChallengeKey(topic: string, tier: string) { return `${topic}:${tier}` }
export function validDemoChallenge(key: string) {
  return topics.some((topic) => topic.challenges.some((challenge) => demoChallengeKey(topic.key, challenge.tier) === key))
}
export function isInitiallySolved(key: string) { return INITIAL_SOLVED.has(key) }

export function buildDemoTree(simulated: ReadonlySet<string>): ChallengeTree {
  const solved = new Set([...INITIAL_SOLVED, ...simulated])
  const complete = new Set(topics.filter((topic) => topic.challenges.length === 3 && topic.challenges.every((challenge) => solved.has(demoChallengeKey(topic.key, challenge.tier)))).map((topic) => topic.key))
  const nodes: ChallengeNode[] = topics.map((topic) => {
    const missing = topic.prerequisites.filter((key) => !complete.has(key))
    const challenges: Challenge[] = [...topic.challenges].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)).map((challenge) => {
      const key = demoChallengeKey(topic.key, challenge.tier)
      return { ...challenge, tier: challenge.tier as Challenge['tier'], verified: solved.has(key), solved_at: solved.has(key) ? '2026-10-20T12:00:00Z' : null, required: true }
    })
    const verified = challenges.filter((challenge) => challenge.verified).length
    const state: ChallengeNode['state'] = complete.has(topic.key) ? 'completed' : missing.length ? 'locked' : 'ready'
    return { key: topic.key, title: topic.title, pathway: topic.pathway, prerequisites: topic.prerequisites,
      missing_prerequisites: missing, codeforces_tag: topic.codeforces_tag, state,
      verified_count: verified, required_count: 3, xp: verified * 100,
      rank: verified ? tierOrder[Math.min(verified - 1, 2)] : 'unranked',
      completed_at: state === 'completed' ? '2026-10-20T12:00:00Z' : null, challenges }
  })
  const recommended = nodes.find((node) => node.state === 'ready' && node.verified_count > 0) ?? nodes.find((node) => node.state === 'ready')
  const completed = nodes.filter((node) => node.state === 'completed').length
  return { handle: 'Demo Student (sample)', synced_at: null, sync_status: 'demo', nodes,
    completed_count: completed, total_count: nodes.length,
    verified_challenges: nodes.reduce((sum, node) => sum + node.verified_count, 0),
    xp: nodes.reduce((sum, node) => sum + node.xp, 0), streak_days: 4,
    recommended_key: recommended?.key ?? null,
    achievements: completed >= 1 ? [{ key: 'topics_1', title: 'First topic mastered · sample' }] : [],
  }
}

function utcDate(daysAgo: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function demoDays(extraSolves: number): AnalyticsResponse['heatmap'] {
  const solveDays = new Set(Array.from({ length: 56 }, (_, index) => Math.floor(index * 359 / 55) + 5))
  const extraDays = new Set(Array.from({ length: 42 }, (_, index) => Math.floor(index * 359 / 41) + 3))
  let cumulative = 0
  return Array.from({ length: 365 }, (_, index) => {
    const age = 364 - index
    const newSolves = (solveDays.has(age) ? 1 : 0) + (age === 0 ? extraSolves : 0)
    const submissions = newSolves + (extraDays.has(age) ? 1 : 0)
    cumulative += newSolves
    return { date: utcDate(age), submissions, accepted_submissions: newSolves + (extraDays.has(age) && index % 4 === 0 ? 1 : 0), new_solves: newSolves, cumulative_solves: cumulative }
  })
}

function timelineForPeriod(days: AnalyticsResponse['heatmap'], period: 'daily' | 'weekly' | 'monthly'): AnalyticsResponse['timeline'] {
  if (period === 'daily') return days
  const buckets = new Map<string, { period: string; submissions: number; accepted_submissions: number; new_solves: number; cumulative_solves: number }>()
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`)
    if (period === 'weekly') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    const key = period === 'monthly' ? day.date.slice(0, 7) : date.toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? { period: key, submissions: 0, accepted_submissions: 0, new_solves: 0, cumulative_solves: 0 }
    bucket.submissions += day.submissions ?? 0
    bucket.accepted_submissions += day.accepted_submissions ?? 0
    bucket.new_solves += day.new_solves ?? 0
    bucket.cumulative_solves = day.cumulative_solves ?? 0
    buckets.set(key, bucket)
  }
  return [...buckets.values()]
}

function problemRecommendation(problem: typeof extras[number] | SeedChallenge, targetTopic: string, category: string, rationale: string[]) {
  return { contest_id: problem.contest_id, problem_index: problem.problem_index,
    name: problem.title, rating: problem.rating, tags: problem.tags, url: problem.url,
    solved_count: 'solved_count' in problem ? problem.solved_count : null,
    target_topic: targetTopic, rank_score: 82, contributions: { topic: 30, difficulty: 28, prerequisites: 16, diversity: 8 },
    rationale, category }
}

export function buildDemoRecommendations(tree: ChallengeTree): RecommendationsResponse {
  const next = tree.nodes.find((node) => node.key === tree.recommended_key)
  const mandatory = next?.challenges.find((item) => !item.verified)
  const required = mandatory ? [problemRecommendation(mandatory, next!.title, 'mandatory_roadmap', [`Required challenge for ${next!.title}. Completing it advances the sample skill tree.`])] : []
  const optional = extras.slice(0, 5).map((problem, index) => problemRecommendation(problem, problem.tags[0] ?? 'Practice', 'optional_practice', [
    index % 2 === 0 ? 'Adds practice near the sample learner’s current rating.' : 'Builds variety across the sample learner’s weaker topics.',
    'This is extra practice and does not block a roadmap unlock.',
  ]))
  return { handle: 'Demo Student (sample)', status: 'ready', cold_start: false, synced_at: null,
    target_rating: 1400, target_rating_source: 'demonstration profile', version: 'demo-1',
    recommendations: [...required, ...optional] }
}

export function buildDemoAnalytics(simulated: ReadonlySet<string>, period: 'daily' | 'weekly' | 'monthly' = 'daily'): AnalyticsResponse {
  const tree = buildDemoTree(simulated)
  const heatmap = demoDays(simulated.size)
  const solved = 56 + simulated.size
  const submissions = 98 + simulated.size
  const acceptedSubmissions = heatmap.reduce((sum, day) => sum + (day.accepted_submissions ?? 0), 0)
  const difficulty = [
    { difficulty: '<1200', count: 18 }, { difficulty: '1200–1599', count: 22 },
    { difficulty: '1600–1999', count: 12 }, { difficulty: '2000+', count: 4 },
    { difficulty: 'Unrated', count: 0 },
  ]
  for (const key of simulated) {
    const challenge = topics.flatMap((topic) => topic.challenges.map((item) => ({ ...item, key: demoChallengeKey(topic.key, item.tier) }))).find((item) => item.key === key)
    if (!challenge) continue
    const bucket = challenge.rating == null ? 4 : challenge.rating < 1200 ? 0 : challenge.rating < 1600 ? 1 : challenge.rating < 2000 ? 2 : 3
    difficulty[bucket].count += 1
  }
  const topicScores = [
    ['implementation', 18, 84], ['strings', 13, 76], ['math', 11, 67],
    ['sortings', 9, 63], ['binary search', 7, 58], ['greedy', 6, 51],
    ['graphs', 4, 38], ['dp', 3, 31],
  ] as const
  const topicsData = topicScores.map(([topic, count, score]) => ({ topic, solved_count: count, score, confidence: count < 5 ? 'low' : 'medium' }))
  const sampleSolved = tree.nodes.flatMap((node) => node.challenges.filter((item) => item.verified).map((item) => ({
    contest_id: item.contest_id, problem_index: item.problem_index, name: item.title,
    rating: item.rating, tags: item.tags, solved_at: '2026-10-20T12:00:00Z', url: item.url,
  })))
  const ratingHistory = [825, 910, 1040, 1125, 1196, 1282, 1331, 1384].map((rating, index, values) => ({
    date: utcDate(245 - index * 33), contest: `Sample contest ${index + 1}`, contest_id: index + 1,
    rating, old_rating: index ? values[index - 1] : 0,
    change: rating - (index ? values[index - 1] : 0), rank: null,
  }))
  const recs = buildDemoRecommendations(tree).recommendations
  return {
    codeforces: { handle: 'Demo Student (sample)', avatar_url: null, has_more: false, rank: 'sample specialist', rating: 1384,
      solved_count: solved, solved_problems: sampleSolved, synced_at: null,
      topic_distribution: topicsData.map((item) => ({ topic: item.topic, solved_count: item.solved_count })), total_submissions: submissions },
    kpis: { distinct_solves: solved, submissions, rating: 1384,
      recent_events: heatmap.slice(-7).reduce((sum, item) => sum + (item.submissions ?? 0), 0),
      streak_days: tree.streak_days, verified_challenges: tree.verified_challenges },
    timeline: timelineForPeriod(heatmap, period), heatmap, topics: topicsData,
    strengths: [...topicsData].sort((a, b) => b.score - a.score).slice(0, 3),
    weaknesses: [...topicsData].sort((a, b) => a.score - b.score).slice(0, 3),
    difficulty,
    difficulty_progression: Array.from({ length: 12 }, (_, index) => ({ date: utcDate(330 - index * 29), average_rating: 920 + index * 48, solved_count: 3 + index % 4 })),
    rating_history: ratingHistory, recommendations: recs.map((item) => ({ ...item, category: 'category' in item && typeof item.category === 'string' ? item.category : 'optional_practice' })), roadmap: tree,
    attempt_vs_accepted: { submissions, accepted_submissions: acceptedSubmissions, distinct_solves: solved },
    recent_activity: sampleSolved.slice(-5).map((item, index) => ({ occurred_at: `${utcDate(index)}T12:00:00Z`, title: item.name, verdict: 'OK' })),
    insights: [{ kind: 'most_practiced', detail: 'Implementation has the most sample practice: 18 distinct solved problems.' },
      { kind: 'focus', detail: 'Dynamic programming has the weakest sample proficiency evidence (31/100).' },
      { kind: 'next_topic', detail: `Study ${tree.nodes.find((item) => item.key === tree.recommended_key)?.title ?? 'the next ready topic'} next to unlock another branch.` }],
    limitations: ['Demonstration data only. No Codeforces account, submission, rating, or AI output belongs to a real learner.'],
  }
}

export const demoReview: ReviewDetail = {
  id: '00000000-0000-4000-8000-000000000001', created_at: '2026-10-20T12:00:00Z',
  provider: 'demo_example', model: 'Prewritten example', language: 'python',
  contest_id: 4, problem_index: 'A', problem_title: 'Watermelon',
  problem_context: 'Can an even weight be split into two positive even parts?',
  code: 'def can_split(weight: int) -> bool:\n    return weight > 2 and weight % 2 == 0',
  feedback: {
    approach_summary: 'The sample solution checks parity and excludes the smallest even weight, which cannot be split into two positive even parts.',
    time_complexity: { estimate: 'O(1)', reasoning: 'Parity and a boundary comparison each take constant time.' },
    space_complexity: { estimate: 'O(1)', reasoning: 'The solution allocates no structure that grows with the input.' },
    potential_edge_cases: ['Weight 2 is even but cannot be split into two positive even parts.', 'Odd weights cannot be represented as a sum of two even numbers.'],
    suggested_improvements: ['Keep the lower-bound check explicit so the parity test is not mistaken for a complete solution.', 'An equivalent approach is to test weight >= 4 and even parity.'],
    uncertainty_notes: ['This is a predefined demonstration review. It was not generated by Gemini and the code was not executed.'],
  },
}
