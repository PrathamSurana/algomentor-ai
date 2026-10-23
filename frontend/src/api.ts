import type { components } from './generated/api'

type HealthResponse = components['schemas']['HealthResponse']
type ReadinessResponse = components['schemas']['ReadinessResponse']
export type CodeforcesSummary = components['schemas']['SummaryResponse']
export type SyncResponse = components['schemas']['SyncResponse']
export type SkillAssessment = components['schemas']['SkillAssessmentResponse']
export type RecommendationsResponse = components['schemas']['RecommendationsResponse']

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
      return { kind: 'setup', message: 'API connected. Configure DATABASE_URL to connect Supabase PostgreSQL.' }
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
