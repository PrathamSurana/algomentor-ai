export type Section = 'overview' | 'problems' | 'roadmap' | 'review'

const paths: Record<Section, string> = {
  overview: '/',
  problems: '/recommendations',
  roadmap: '/roadmap',
  review: '/review',
}

export function pathForSection(section: Section): string {
  return paths[section]
}

export function sectionFromPath(pathname: string): Section {
  if (pathname === '/recommendations' || pathname === '/problems') return 'problems'
  if (pathname === '/roadmap') return 'roadmap'
  if (pathname === '/review') return 'review'
  return 'overview'
}

export function safeReturnPath(value: string | null | undefined): string {
  if (value === '/problems') return paths.problems
  return Object.values(paths).includes(value ?? '') ? value! : '/'
}

export function intendedPath(pathname: string, search: string): string {
  if (pathname === '/auth/callback') {
    return safeReturnPath(new URLSearchParams(search).get('next'))
  }
  return safeReturnPath(pathname)
}

export function callbackUrl(origin: string, returnTo: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeReturnPath(returnTo))}`
}

export function callbackError(search: string, hash: string): string | null {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const error = query.get('error') ?? fragment.get('error')
  const description = query.get('error_description') ?? fragment.get('error_description') ?? ''
  if (!error) return null
  if (error === 'access_denied') return 'Google sign-in was cancelled or not approved. You can try again.'
  if (/provider.*(disabled|not enabled)|unsupported provider/i.test(description)) {
    return 'Google sign-in is unavailable. Check the Google provider settings in Supabase.'
  }
  return 'Sign-in could not be completed. Please try again or use an email link.'
}
