export type HealthStatus = 'checking' | 'online' | 'offline' | 'unconfigured'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

export async function checkApiHealth(signal?: AbortSignal): Promise<HealthStatus> {
  if (!apiBaseUrl) return 'unconfigured'

  try {
    const response = await fetch(`${apiBaseUrl}/health`, { signal })
    if (!response.ok) return 'offline'
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
      ? 'online'
      : 'offline'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return 'offline'
  }
}
