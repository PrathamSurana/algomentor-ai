import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  Braces, CheckCircle2, CircleAlert, Code2, Database, LayoutDashboard,
  LoaderCircle, LogOut, Map, RefreshCw, UserRound, ChevronRight,
} from 'lucide-react'
import { getServiceState, type ServiceState } from './api'
import { callbackError, intendedPath, pathForSection, sectionFromPath, type Section } from './authRoutes'
import LoginPage from './LoginPage'
import RecommendationsPage from './RecommendationsPage'
import ReviewPage from './ReviewPage'
import DemoReviewPage from './DemoReviewPage'
import { DemoDataProvider, useDemoData } from './DemoDataProvider'
import { useAuthSession } from './useAuthSession'

const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'))
const RoadmapPage = lazy(() => import('./RoadmapPage'))

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'problems', label: 'Recommendations', icon: Braces },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'review', label: 'Code review', icon: Code2 },
] as const

function profile(session: Session) {
  const metadata = session.user.user_metadata
  const name = [metadata.full_name, metadata.name, metadata.display_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?? session.user.email?.split('@')[0] ?? 'AlgoMentor user'
  const rawAvatar = metadata.avatar_url ?? metadata.picture
  let avatar: string | null = null
  if (typeof rawAvatar === 'string') {
    try {
      const url = new URL(rawAvatar)
      if (url.protocol === 'https:') avatar = url.toString()
    } catch { /* An invalid avatar URL falls back to initials. */ }
  }
  return { name, email: session.user.email ?? 'No email available', avatar }
}

function ProfileMenu({ session, client, onSignedOut }: {
  session: Session
  client: SupabaseClient
  onSignedOut: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const user = profile(session)
  const avatar = user.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full object-cover" />
    : <span className="flex size-9 items-center justify-center rounded-full bg-indigo-400/15 text-sm font-semibold text-indigo-200">{user.name.slice(0, 1).toUpperCase()}</span>

  async function signOut() {
    setBusy(true)
    setError(null)
    try {
      const { error: authError } = await client.auth.signOut()
      if (authError) throw authError
      onSignedOut()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <details className="group relative">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-left hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-indigo-400 [&::-webkit-details-marker]:hidden">
      {avatar}<span className="hidden min-w-0 flex-1 lg:block"><span className="block truncate text-sm font-semibold text-slate-200">{user.name}</span><span className="block truncate text-xs text-slate-500">{user.email}</span></span><UserRound size={16} className="hidden text-slate-500 lg:block" />
    </summary>
    <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/10 bg-[#172033] p-3 shadow-2xl lg:bottom-full lg:left-0 lg:right-auto lg:top-auto lg:mb-2 lg:mt-0 lg:w-full">
      <p className="truncate px-2 text-sm font-semibold text-slate-200">{user.name}</p><p className="truncate px-2 pt-1 text-xs text-slate-400">{user.email}</p>
      <div className="mt-3 border-t border-white/10 pt-2"><button type="button" onClick={signOut} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-rose-200 hover:bg-rose-400/10 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <LogOut size={16} />} Sign out</button></div>
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-rose-300">{error}</p>}
    </div>
  </details>
}

function AuthScreen({ error, onRetry, onExploreDemo }: { error?: string; onRetry?: () => void; onExploreDemo?: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-6 text-slate-100"><section role={error ? 'alert' : 'status'} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111929] p-8 text-center shadow-2xl"><span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">{error ? <CircleAlert size={24} /> : <LoaderCircle size={24} className="animate-spin" />}</span><h1 className="mt-5 text-xl font-semibold">{error ? 'Could not verify sign-in' : 'Restoring your session'}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{error ?? 'Checking your Supabase session before opening AlgoMentor AI…'}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-400"><RefreshCw size={15} /> Retry</button>}{onExploreDemo && <button type="button" onClick={onExploreDemo} className="ui-button ui-button-secondary mx-auto mt-3">Explore Demo</button>}</section></main>
}

function AppContent() {
  const auth = useAuthSession()
  const demo = useDemoData()
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [returnError] = useState(() => callbackError(window.location.search, window.location.hash))
  const [service, setService] = useState<ServiceState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const section: Section = sectionFromPath(pathname)

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (pathname !== '/auth/callback' || auth.state.status !== 'authenticated') return
    const target = intendedPath(pathname, window.location.search)
    window.history.replaceState({}, '', target)
    setPathname(target)
  }, [auth.state.status, pathname])

  useEffect(() => {
    if (demo.active || auth.state.status !== 'authenticated') return
    const controller = new AbortController()
    getServiceState(controller.signal).then(setService).catch(() => undefined)
    return () => controller.abort()
  }, [auth.state.status, demo.active, attempt])

  function navigate(next: Section) {
    const path = pathForSection(next)
    window.history.pushState({}, '', path)
    setPathname(path)
  }

  function retryServices() {
    setService({ kind: 'loading' })
    setAttempt((value) => value + 1)
  }

  function enterDemo() {
    demo.enter()
    navigate('overview')
  }

  function exitDemo() {
    demo.exit()
    window.history.replaceState({}, '', '/')
    setPathname('/')
  }

  if (!demo.active && auth.state.status === 'loading') return <AuthScreen />
  if (!demo.active && auth.state.status === 'error') {
    return <AuthScreen error={auth.state.message} onRetry={auth.retry} onExploreDemo={enterDemo} />
  }
  if (!demo.active && auth.state.status === 'signed_out') {
    const returnTo = intendedPath(pathname, window.location.search)
    const failedCallback = pathname === '/auth/callback' && new URLSearchParams(window.location.search).has('code')
    return <LoginPage client={auth.client} returnTo={returnTo} initialError={returnError ?? (failedCallback ? 'This sign-in link expired or could not be completed. Please try again.' : null)} onExploreDemo={enterDemo} />
  }
  if (!demo.active && pathname === '/auth/callback') return <AuthScreen />

  const session = auth.state.status === 'authenticated' && !demo.active ? auth.state.session : null
  const client = auth.client

  return <div className="app-shell min-h-screen text-slate-100">
    <div className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col lg:flex-row">
      <aside className="app-sidebar border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-5 lg:px-6 lg:py-8"><div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-700 shadow-lg shadow-violet-500/20"><Code2 size={20} /></span><span>AlgoMentor <span className="text-violet-300">AI</span></span></div><div className="lg:hidden">{demo.active ? <span className="ui-badge">Demo Mode</span> : session && client ? <ProfileMenu session={session} client={client} onSignedOut={() => { window.history.replaceState({}, '', '/'); setPathname('/') }} /> : null}</div></div>
        <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
          {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => navigate(id)} aria-current={section === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition lg:w-full ${section === id ? 'bg-violet-400/12 text-violet-200 ring-1 ring-inset ring-violet-400/15' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon size={17} /><span>{label}</span>{section === id && <ChevronRight size={14} className="ml-auto hidden opacity-60 lg:block" />}</button>)}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">{demo.active ? <div className="space-y-3"><p className="ui-badge">Demo Mode · Demo Student</p><button type="button" onClick={demo.reset} className="ui-button ui-button-secondary w-full"><RefreshCw size={15} /> Reset Demo</button><button type="button" onClick={exitDemo} className="ui-button ui-button-secondary w-full"><LogOut size={15} /> Exit Demo</button></div> : session && client ? <ProfileMenu session={session} client={client} onSignedOut={() => { window.history.replaceState({}, '', '/'); setPathname('/') }} /> : null}</div>
      </aside>
      <main className="app-main min-w-0 flex-1 px-5 pb-16 pt-7 sm:px-8 lg:px-10 lg:pt-9">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7"><div><p className="ui-eyebrow">{demo.active ? 'Demo Mode · sample workspace' : 'Workspace'} <span className="mx-1 text-slate-600">/</span> {section}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{section === 'overview' ? `Welcome back, ${demo.active ? 'Demo Student' : session ? profile(session).name.split(' ')[0] : 'learner'}` : navigation.find((item) => item.id === section)?.label}</h1><p className="mt-2 text-sm text-slate-400">{demo.active ? 'Illustrative learning data. Nothing here is written to a real account.' : section === 'overview' ? 'Your practice, progress, and next move in one place.' : 'Make the next step count.'}</p></div>{demo.active ? <div className="flex flex-wrap items-center gap-2"><span className="ui-badge">Demo Mode</span><button type="button" onClick={demo.reset} className="ui-button ui-button-secondary text-xs"><RefreshCw size={14} /> Reset Demo</button><button type="button" onClick={exitDemo} className="ui-button ui-button-secondary text-xs"><LogOut size={14} /> Exit Demo</button></div> : <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400"><span className={`size-2 rounded-full ${service.kind === 'ready' ? 'bg-emerald-400' : service.kind === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />{service.kind === 'loading' ? 'Checking services' : service.kind === 'ready' ? 'All systems ready' : service.kind === 'setup' ? 'Setup needed' : 'Connection issue'}</div>}</header>
        <div aria-live="polite" className="mt-8">
          {!demo.active && service.kind === 'loading' && <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><div className="flex items-center gap-3 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin text-indigo-300" /> Checking API and database connection…</div><div className="mt-6 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-white/5" />)}</div></div>}
          {!demo.active && service.kind === 'error' && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5"><CircleAlert size={22} className="shrink-0 text-rose-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-rose-100">Connection error</p><p className="mt-1 text-sm text-rose-200/70">{service.message}</p></div><button type="button" onClick={retryServices} className="inline-flex items-center gap-2 rounded-lg bg-rose-300/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-300/20"><RefreshCw size={15} /> Retry</button></div>}
          {!demo.active && service.kind === 'setup' && <div role="status" className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5"><Database size={22} className="shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-amber-100">Setup needed</p><p className="mt-1 text-sm text-amber-100/70">{service.message}</p></div><button type="button" onClick={retryServices} className="inline-flex items-center gap-2 rounded-lg bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20"><RefreshCw size={15} /> Recheck</button></div>}
          {!demo.active && service.kind === 'ready' && <span role="status" className="sr-only"><CheckCircle2 size={20} /> API and database are connected.</span>}
        </div>
        {section === 'overview' && <Suspense fallback={<div role="status" className="ui-skeleton mt-8 h-64"><span className="sr-only">Loading dashboard…</span></div>}><AnalyticsDashboard session={session} demoAnalytics={demo.active ? demo.analytics : undefined} onOpenRecommendations={() => navigate('problems')} onOpenRoadmap={() => navigate('roadmap')} /></Suspense>}
        {section === 'problems' && <RecommendationsPage session={session} demoResult={demo.active ? demo.recommendations : undefined} onOpenOverview={() => navigate('overview')} />}
        {section === 'roadmap' && <Suspense fallback={<div role="status" className="ui-skeleton mt-8 h-64"><span className="sr-only">Loading roadmap…</span></div>}><RoadmapPage session={session} demoTree={demo.active ? demo.tree : undefined} onDemoSolve={demo.active ? demo.simulate : undefined} onOpenOverview={() => navigate('overview')} /></Suspense>}
        {section === 'review' && (demo.active ? <DemoReviewPage /> : session && <ReviewPage session={session} />)}
      </main>
    </div>
  </div>
}

export default function App() {
  return <DemoDataProvider><AppContent /></DemoDataProvider>
}
