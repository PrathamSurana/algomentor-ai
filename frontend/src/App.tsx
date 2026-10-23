import { useEffect, useState } from 'react'
import { Activity, ArrowRight, BookOpen, Braces, ChartNoAxesCombined, CheckCircle2, CircleAlert, Code2, Database, LayoutDashboard, LoaderCircle, Map, RefreshCw } from 'lucide-react'
import { getServiceState, type ServiceState } from './api'

type Section = 'overview' | 'problems' | 'roadmap' | 'review'

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'problems', label: 'Problems', icon: Braces },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'review', label: 'Code review', icon: Code2 },
] as const

const panels: Record<Exclude<Section, 'overview'>, { title: string; description: string; icon: typeof Braces }> = {
  problems: { title: 'Problem recommendations', description: 'Recommendations will appear here after a Codeforces history import and proficiency analysis.', icon: Braces },
  roadmap: { title: 'Learning roadmap', description: 'Your prerequisite-based milestones will appear here after your profile is connected.', icon: Map },
  review: { title: 'Code review', description: 'The solution review form will be available once account and AI provider setup is complete.', icon: Code2 },
}

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

  return (
    <div className="min-h-screen bg-[#080d18] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_75%_0%,rgba(72,61,161,0.13),transparent_45%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-[#0c1220]/90 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-8">
            <div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/20"><Code2 size={20} /></span><span>AlgoMentor <span className="text-indigo-300">AI</span></span></div>
            <span className="rounded-md border border-indigo-400/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-indigo-300 lg:hidden">MVP</span>
          </div>
          <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0">
            {navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition lg:w-full ${section === id ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon size={18} /><span>{label}</span></button>)}
          </nav>
          <div className="mt-auto hidden border-t border-white/10 p-5 lg:block"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project status</p><p className="mt-2 text-sm text-slate-300">Initial scaffold</p><p className="mt-1 text-xs leading-5 text-slate-500">Data features are scheduled for the next milestone.</p></div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-10">
          <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-8">
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Workspace / {section}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{section === 'overview' ? 'Your dashboard' : navigation.find((item) => item.id === section)?.label}</h1><p className="mt-2 text-sm text-slate-400">A clear place to track your DSA and competitive programming progress.</p></div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400"><span className={`size-2 rounded-full ${service.kind === 'ready' ? 'bg-emerald-400' : service.kind === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />{service.kind === 'loading' ? 'Checking services' : service.kind === 'ready' ? 'Services ready' : service.kind === 'setup' ? 'Setup needed' : 'Connection issue'}</div>
          </header>

          <div aria-live="polite" className="mt-8">
            {service.kind === 'loading' && <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><div className="flex items-center gap-3 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin text-indigo-300" /> Checking API and database connection…</div><div className="mt-6 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-white/5" />)}</div></div>}
            {service.kind === 'error' && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5"><CircleAlert size={22} className="shrink-0 text-rose-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-rose-100">Connection error</p><p className="mt-1 text-sm text-rose-200/70">{service.message}</p></div><button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-lg bg-rose-300/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-300/20"><RefreshCw size={15} /> Retry</button></div>}
            {service.kind === 'setup' && <div role="status" className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5"><Database size={22} className="shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="font-semibold text-amber-100">Setup needed</p><p className="mt-1 text-sm text-amber-100/70">{service.message}</p></div><button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-lg bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20"><RefreshCw size={15} /> Recheck</button></div>}
            {service.kind === 'ready' && <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm text-emerald-100"><CheckCircle2 size={20} className="text-emerald-300" /> API and database are connected. User data features are coming in the next milestone.</div>}
          </div>

          {section === 'overview' ? <Overview onNavigate={setSection} /> : <EmptySection section={section} />}
        </main>
      </div>
    </div>
  )
}

function Overview({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return <>
    <div className="mt-10 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p><h2 className="mt-2 text-xl font-semibold">Learning snapshot</h2></div><span className="text-sm text-slate-500">Awaiting connected account</span></div>
    <div className="mt-5 grid gap-4 md:grid-cols-3">{[{ icon: Activity, label: 'Problems solved' }, { icon: ChartNoAxesCombined, label: 'Topic proficiency' }, { icon: BookOpen, label: 'Current milestone' }].map(({ icon: Icon, label }) => <div key={label} className="min-h-36 rounded-2xl border border-white/10 bg-[#111929] p-6"><Icon size={20} className="text-indigo-300" /><p className="mt-6 text-sm text-slate-400">{label}</p><p className="mt-1 font-medium text-slate-200">No data yet</p></div>)}</div>
    <div className="mt-8 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Get started</p><h2 className="mt-3 text-2xl font-semibold">Make your practice count.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">Once account connection is available, your public submissions will power topic insights and problem recommendations. This dashboard does not show invented progress.</p><div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => onNavigate('problems')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">Explore problems <ArrowRight size={16} /></button><button type="button" onClick={() => onNavigate('roadmap')} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">View roadmap</button></div></section><section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">What comes next</p><ol className="mt-6 space-y-5 text-sm text-slate-300"><li className="flex gap-3"><span className="text-indigo-300">01</span> Connect a Codeforces handle</li><li className="flex gap-3"><span className="text-indigo-300">02</span> Import public submissions</li><li className="flex gap-3"><span className="text-indigo-300">03</span> Review your topic insights</li></ol><p className="mt-8 border-t border-white/10 pt-5 text-xs leading-5 text-slate-500">These steps are planned and are not active in this scaffold.</p></section></div>
  </>
}

function EmptySection({ section }: { section: Exclude<Section, 'overview'> }) {
  const { title, description, icon: Icon } = panels[section]
  return <section className="mt-10 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-12 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-400/10 text-indigo-300"><Icon size={26} /></span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p><span className="mt-6 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-500">Coming in a later milestone</span></section>
}

export default App
