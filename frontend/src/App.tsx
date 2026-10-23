import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, BrainCircuit, Code2, Map, RefreshCw } from 'lucide-react'
import { checkApiHealth, type HealthStatus } from './api'

const workflow = [
  { icon: Activity, title: 'Import history', detail: 'Connect a public Codeforces handle.' },
  { icon: BrainCircuit, title: 'Measure progress', detail: 'See topic scores with confidence.' },
  { icon: Map, title: 'Find your next step', detail: 'Follow problems and a learning roadmap.' },
  { icon: Code2, title: 'Review your code', detail: 'Paste a solution for advisory feedback.' },
]

function App() {
  const [status, setStatus] = useState<HealthStatus>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    checkApiHealth(controller.signal)
      .then(setStatus)
      .catch(() => undefined)
    return () => controller.abort()
  }, [attempt])

  return (
    <div className="min-h-screen bg-[#080c17] text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.18),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 py-6">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"><Code2 size={19} /></span>
            AlgoMentor <span className="text-indigo-300">AI</span>
          </div>
          <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-indigo-200">MVP in progress</span>
        </header>

        <main className="py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-300">Your competitive programming workspace</p>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight sm:text-7xl">A clearer path to your <span className="text-indigo-300">next solve.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">AlgoMentor AI is being built to turn public Codeforces history into practical topic insights, problem recommendations, and a personal learning roadmap.</p>
          </div>

          <section aria-label="Service status" className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:w-fit">
            <span className={`size-2.5 rounded-full ${status === 'online' ? 'bg-emerald-400' : status === 'checking' ? 'bg-amber-400' : 'bg-rose-400'}`} />
            <div>
              <p className="text-sm font-medium">Backend {status === 'online' ? 'connected' : status === 'checking' ? 'checking…' : status === 'unconfigured' ? 'URL not configured' : 'unavailable'}</p>
              <p className="text-xs text-slate-500">Live connection to the FastAPI health endpoint</p>
            </div>
            <button type="button" onClick={() => { setStatus('checking'); setAttempt(value => value + 1) }} aria-label="Retry connection" className="ml-auto rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"><RefreshCw size={16} /></button>
          </section>

          <section className="mt-20" aria-label="Planned workflow">
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">The workflow <ArrowUpRight size={16} /></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map(({ icon: Icon, title, detail }, index) => (
                <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <div className="mb-9 flex items-start justify-between"><Icon className="text-indigo-300" size={22} /><span className="text-xs tabular-nums text-slate-600">0{index + 1}</span></div>
                  <h2 className="font-semibold">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
