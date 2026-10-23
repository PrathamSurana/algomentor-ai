import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Code2, Database, LayoutDashboard, LoaderCircle, Map, Braces, RefreshCw } from 'lucide-react'
import { getServiceState, type ServiceState } from './api'
import CodeforcesPanel from './CodeforcesPanel'
import RecommendationsPage from './RecommendationsPage'

type Section = 'overview' | 'problems' | 'roadmap' | 'review'

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'problems', label: 'Recommendations', icon: Braces },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'review', label: 'Code review', icon: Code2 },
] as const

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [service, setService] = useState<ServiceState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getServiceState(controller.signal).then(setService).catch(() => undefined)
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setService({ kind: 'loading' })
    setAttempt((value) => value + 1)
  }

  return <div className="min-h-screen bg-[#080d18] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_75%_0%,rgba(72,61,161,0.13),transparent_45%)]" />
    <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
      <aside className="border-b border-white/10 bg-[#0c1220]/90 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-8"><div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/20"><Code2 size={20} /></span><span>AlgoMentor <span className="text-indigo-300">AI</span></span></div><span className="rounded-md border border-indigo-400/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-indigo-300 lg:hidden">MVP</span></div>
        <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
          {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition lg:w-full ${section === id ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon size={18} /><span>{label}</span></button>)}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-5 lg:block"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project status</p><p className="mt-2 text-sm text-slate-300">Codeforces import</p><p className="mt-1 text-xs leading-5 text-slate-500">Only public coding history is available in this milestone.</p></div>
      </aside>
      <main className="min-w-0 flex-1 px-5 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-10">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-8"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Workspace / {section}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{section === 'overview' ? 'Your dashboard' : navigation.find((item) => item.id === section)?.label}</h1><p className="mt-2 text-sm text-slate-400">Explore public Codeforces activity and your next steps.</p></div><div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400"><span className={`size-2 rounded-full ${service.kind === 'ready' ? 'bg-emerald-400' : service.kind === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />{service.kind === 'loading' ? 'Checking services' : service.kind === 'ready' ? 'Services ready' : service.kind === 'setup' ? 'Setup needed' : 'Connection issue'}</div></header>
        <div aria-live="polite" className="mt-8">
          {service.kind === 'loading' && <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><div className="flex items-center gap-3 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin text-indigo-300" /> Checking API and database connection…</div><div className="mt-6 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-white/5" />)}</div></div>}
          {service.kind === 'error' && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5"><CircleAlert size={22} className="shrink-0 text-rose-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-rose-100">Connection error</p><p className="mt-1 text-sm text-rose-200/70">{service.message}</p></div><button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-lg bg-rose-300/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-300/20"><RefreshCw size={15} /> Retry</button></div>}
          {service.kind === 'setup' && <div role="status" className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5"><Database size={22} className="shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-amber-100">Setup needed</p><p className="mt-1 text-sm text-amber-100/70">{service.message}</p></div><button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-lg bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20"><RefreshCw size={15} /> Recheck</button></div>}
          {service.kind === 'ready' && <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm text-emerald-100"><CheckCircle2 size={20} className="text-emerald-300" /> API and database are connected.</div>}
        </div>
        {section === 'overview' && <CodeforcesPanel />}
        {section === 'problems' && <RecommendationsPage onOpenOverview={() => setSection('overview')} />}
        {section === 'roadmap' && <EmptySection title="Learning roadmap" description="Prerequisite-based milestones will appear here in a later milestone." icon={Map} />}
        {section === 'review' && <EmptySection title="Code review" description="AI feedback on pasted solutions will appear here in a later milestone." icon={Code2} />}
      </main>
    </div>
  </div>
}

function EmptySection({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Map }) {
  return <section className="mt-10 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-12 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-400/10 text-indigo-300"><Icon size={26} /></span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p></section>
}

export default App
