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
  } catch {
    throw new Error('Could not reach the API. Check your connection and try again.')
  }
  const body = await response.json()
  if (!response.ok) {
    const message = body?.detail?.message
    throw new Error(typeof message === 'string' ? message : 'The request failed. Please try again.')
  }
  return body as T
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
