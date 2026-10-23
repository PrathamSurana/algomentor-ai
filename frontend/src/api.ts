import type { components } from './generated/api'

type HealthResponse = components['schemas']['HealthResponse']
type ReadinessResponse = components['schemas']['ReadinessResponse']

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
