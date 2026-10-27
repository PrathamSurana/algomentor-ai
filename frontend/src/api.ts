import type { components } from './generated/api'

type HealthResponse = components['schemas']['HealthResponse']
type ReadinessResponse = components['schemas']['ReadinessResponse']
export type CodeforcesSummary = components['schemas']['SummaryResponse']
export type SyncResponse = components['schemas']['SyncResponse']
export type SkillAssessment = components['schemas']['SkillAssessmentResponse']
export type RecommendationsResponse = components['schemas']['RecommendationsResponse']
export type RoadmapResponse = components['schemas']['RoadmapResponse']
export type ReviewRequest = components['schemas']['ReviewRequest']
export type ReviewDetail = components['schemas']['ReviewDetail']
export type ReviewHistory = components['schemas']['ReviewHistory']
export type LinkedAccount = { platform: 'codeforces'; username: string; synced_at: string | null; sync_status: string; sync_error: string | null }
export type Challenge = { tier: 'beginner' | 'intermediate' | 'advanced'; contest_id: number; problem_index: string; title: string; rating: number | null; tags: string[]; url: string; verified: boolean; solved_at: string | null; required: boolean }
export type ChallengeNode = { key: string; title: string; pathway: string; prerequisites: string[]; missing_prerequisites: string[]; codeforces_tag: string; state: 'ready' | 'locked' | 'completed'; verified_count: number; required_count: number; xp: number; rank: string; completed_at: string | null; challenges: Challenge[] }
export type ChallengeTree = { handle: string | null; synced_at: string | null; sync_status: string; nodes: ChallengeNode[]; completed_count: number; total_count: number; verified_challenges: number; xp: number; streak_days: number; recommended_key: string | null; achievements: { key: string; title: string }[] }
export type AnalyticsDay = { date: string; submissions: number | null; accepted_submissions: number | null; new_solves: number | null; cumulative_solves: number | null }
export type AnalyticsPeriod = Omit<AnalyticsDay, 'date'> & { period: string }
export type AnalyticsResponse = {
  codeforces: CodeforcesSummary | null
  kpis: { distinct_solves: number | null; submissions: number | null; rating: number | null; recent_events: number | null; streak_days: number; verified_challenges: number }
  timeline: (AnalyticsDay | AnalyticsPeriod)[]
  heatmap: AnalyticsDay[]
  topics: { topic: string; solved_count: number; score: number | null; confidence: string }[]
  strengths: { topic: string; score: number }[]
  weaknesses: { topic: string; score: number }[]
  difficulty: { difficulty: string; count: number }[]
  difficulty_progression: { date: string; average_rating: number; solved_count: number }[]
  rating_history: { date: string; contest: string; contest_id: number; rating: number; old_rating: number; change: number; rank: number | null }[]
  recommendations: (components['schemas']['ProblemRecommendation'] & { category: string })[]
  roadmap: ChallengeTree
  attempt_vs_accepted: { submissions: number | null; accepted_submissions: number | null; distinct_solves: number | null }
  recent_activity: { occurred_at: string; title: string; verdict: string | null }[]
  insights: { kind: string; detail: string }[]
  limitations: string[]
}

export type ServiceState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'setup'; message: string }
  | { kind: 'error'; message: string }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

async function readJson<T>(path: string, signal: AbortSignal): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${apiBaseUrl}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  const body = (await response.json()) as T
  return { response, body }
}

export async function getServiceState(signal: AbortSignal): Promise<ServiceState> {
  if (!apiBaseUrl) {
    return { kind: 'setup', message: 'Set VITE_API_BASE_URL in frontend/.env.local.' }
  }

  try {
    const health = await readJson<HealthResponse>('/health', signal)
    if (!health.response.ok || health.body.status !== 'ok') {
      return { kind: 'error', message: 'The API health check failed. Check the backend process.' }
    }

    const readiness = await readJson<ReadinessResponse>('/health/ready', signal)
    if (readiness.response.status === 503 && readiness.body.database === 'unavailable') {
      const reason = readiness.body.reason
      if (reason === 'missing_tables') {
        return { kind: 'setup', message: `Database connected. Apply the existing SQL migrations in order. Missing: ${readiness.body.missing_tables.join(', ')}.` }
      }
      if (reason === 'dns_failure') {
        return { kind: 'error', message: 'The database hostname did not resolve. Check the Supabase Connect details; use the Session pooler if your network lacks IPv6.' }
      }
      if (reason === 'authentication_failed') {
        return { kind: 'error', message: 'The database rejected the credentials. Check the password and username from Supabase Connect.' }
      }
      if (reason === 'not_configured') {
        return { kind: 'setup', message: 'Set DATABASE_URL in backend/.env, then restart FastAPI.' }
      }
      return { kind: 'error', message: 'The database connection failed. Check Supabase connectivity and backend logs.' }
    }
    if (!readiness.response.ok || readiness.body.status !== 'ok') {
      return { kind: 'error', message: 'The API readiness check failed. Try again.' }
    }
    return { kind: 'ready' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { kind: 'error', message: 'Could not reach the API. Check VITE_API_BASE_URL and that FastAPI is running.' }
  }
}

async function apiRequest<T>(path: string, options: RequestInit, timeoutMs = 8000): Promise<T> {
  if (!apiBaseUrl) throw new Error('API URL is not configured.')
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'name' in cause && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
      throw new Error(`The API timed out after ${Math.round(timeoutMs / 1000)} seconds. Retry the request; if it persists, check backend and database logs.`)
    }
    throw new Error(`Could not connect to the API at ${apiBaseUrl}. Check that FastAPI is running and the frontend API URL is correct.`)
  }
  let body: unknown = null
  if (response.status !== 204) {
    try {
      body = await response.json()
    } catch {
      throw new Error(`API returned HTTP ${response.status} with an invalid JSON response. Check the FastAPI logs.`)
    }
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
    const message = detail && typeof detail === 'object' && 'message' in detail ? detail.message : null
    const validation = Array.isArray(detail) ? detail.find((item) => typeof item?.msg === 'string')?.msg : null
    const fallback = response.status === 401 ? 'Your session expired. Sign in again.' : response.status === 503 ? 'The API or database is temporarily unavailable.' : 'The request failed. Please try again.'
    throw new Error(`HTTP ${response.status}: ${typeof message === 'string' ? message : typeof validation === 'string' ? validation : fallback}`)
  }
  return body as T
}

export function getAnalytics(token: string, period: 'daily' | 'weekly' | 'monthly' = 'daily') {
  return apiRequest<AnalyticsResponse>(`/analytics?period=${period}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  }, 20000)
}

export function getLinkedAccounts(token: string) {
  return apiRequest<{ accounts: LinkedAccount[] }>('/platforms/accounts', {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  })
}

export function linkCodeforces(token: string, username: string) {
  return apiRequest<LinkedAccount>('/platforms/codeforces/link', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  })
}

export function syncLinkedCodeforces(token: string, username: string, mode: 'refresh' | 'continue' = 'refresh') {
  return apiRequest<SyncResponse & { rating_history_status: 'ready' | 'error' }>(
    '/platforms/codeforces/sync', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, mode }),
    }, 120000,
  )
}

export async function syncLinkedCodeforcesHistory(
  token: string, username: string, mode: 'refresh' | 'continue' = 'refresh',
  onBatch?: (saved: number) => void,
) {
  let result = await syncLinkedCodeforces(token, username, mode)
  let saved = result.new_submissions
  onBatch?.(saved)
  for (let batch = 0; result.has_more && batch < 29; batch += 1) {
    result = await syncLinkedCodeforces(token, result.handle, 'continue')
    saved += result.new_submissions
    onBatch?.(saved)
  }
  return { ...result, new_submissions: saved }
}

export function syncCodeforcesRatings(token: string) {
  return apiRequest<{ contest_count: number }>('/platforms/codeforces/ratings/sync', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  }, 30000)
}

export function unlinkPlatform(token: string) {
  return apiRequest<null>('/platforms/codeforces', {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  })
}

export async function getChallengeTree(token: string) {
  const tree = await apiRequest<ChallengeTree>('/roadmap/tree', {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  }, 45000)
  if (!tree || !Array.isArray(tree.nodes) || typeof tree.total_count !== 'number' ||
    tree.nodes.some((node) => !node || typeof node.key !== 'string' || !Array.isArray(node.prerequisites) || !Array.isArray(node.challenges))) {
    throw new Error('The roadmap API returned an invalid topic graph. Check the backend response schema.')
  }
  return tree
}

export function syncCodeforces(handle: string, mode: 'refresh' | 'continue' = 'refresh') {
  return apiRequest<SyncResponse>('/codeforces/sync', {
    method: 'POST',
    body: JSON.stringify({ handle, mode }),
  }, 120000)
}

export function getCodeforcesSummary(handle: string) {
  return apiRequest<CodeforcesSummary>(
    `/codeforces/users/${encodeURIComponent(handle)}/summary`, { method: 'GET' },
  )
}

export function getCodeforcesSkills(handle: string) {
  return apiRequest<SkillAssessment>(
    `/codeforces/users/${encodeURIComponent(handle)}/skills`, { method: 'GET' },
  )
}

export function getRecommendations(handle: string, limit = 8) {
  return apiRequest<RecommendationsResponse>(
    `/codeforces/users/${encodeURIComponent(handle)}/recommendations?limit=${limit}`,
    { method: 'GET' },
  )
}

function roadmapPath(handle?: string | null) {
  return handle ? `?handle=${encodeURIComponent(handle)}` : ''
}

export function getRoadmap(token: string, handle?: string | null) {
  return apiRequest<RoadmapResponse>(`/roadmap${roadmapPath(handle)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  })
}

export function updateRoadmapMilestone(
  token: string, key: string, completed: boolean, handle?: string | null,
) {
  return apiRequest<RoadmapResponse>(`/roadmap/${encodeURIComponent(key)}${roadmapPath(handle)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ completed }),
  })
}

export function createReview(token: string, input: ReviewRequest) {
  return apiRequest<ReviewDetail>('/reviews', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  }, 75000)
}

export function getReviewHistory(token: string) {
  return apiRequest<ReviewHistory>('/reviews?limit=20', {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  })
}

export function getReview(token: string, id: string) {
  return apiRequest<ReviewDetail>(`/reviews/${encodeURIComponent(id)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  })
}
