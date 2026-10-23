import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { getRecommendations, type RecommendationsResponse } from './api'
import { CODEFORCES_HANDLE_KEY } from './storage'

const featureLabels = [
  ['topic', 'Topic fit'], ['difficulty', 'Difficulty fit'],
  ['prerequisites', 'Prerequisites'], ['diversity', 'Diversity'],
] as const

export default function RecommendationsPage({ onOpenOverview }: { onOpenOverview: () => void }) {
  const [handle] = useState(() => localStorage.getItem(CODEFORCES_HANDLE_KEY))
  const [result, setResult] = useState<RecommendationsResponse | null>(null)
  const [loading, setLoading] = useState(Boolean(handle))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!handle) return
    let active = true
    getRecommendations(handle)
      .then((data) => { if (active) setResult(data) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load recommendations.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [handle, attempt])

  function retry() {
    setLoading(true)
    setError(null)
    setResult(null)
    setAttempt((value) => value + 1)
  }

  return <div className="mt-9 space-y-6">
    <section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Personalized practice</p><h2 className="mt-2 text-2xl font-semibold">Recommended problems</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Unsolved Codeforces problems ranked by topic priority, difficulty fit, prerequisite readiness, and variety. Every point in the rank score has a visible reason.</p></div>{handle && <button type="button" onClick={retry} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>}</div>
      {result?.target_rating !== null && result?.target_rating !== undefined && <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-indigo-400/10 px-3 py-1.5 text-indigo-200">Target rating {result.target_rating}</span><span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Based on {result.target_rating_source}</span>{result.cold_start && <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-200">Starter path</span>}</div>}
      {result?.synced_at && <p className="mt-4 text-xs text-slate-500">Based on history synced {new Date(result.synced_at).toLocaleString()}. Sync again after new solves to update this list.</p>}
    </section>

    {!handle && <StateCard title="Connect a public handle" message="Sync a Codeforces handle on the overview page to get recommendations from your stored history." onOpenOverview={onOpenOverview} />}
    {loading && <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111929] p-6 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin" /> Ranking unsolved problems…</div>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-200"><CircleAlert size={19} /><span className="flex-1">{error}</span><button type="button" onClick={retry} className="rounded-lg border border-rose-300/20 px-3 py-2">Retry</button></div>}
    {result?.status === 'history_incomplete' && <StateCard title="Finish importing history" message="Older submission pages remain. Load them from Overview before recommendations are shown, so previously solved problems stay out of the list." onOpenOverview={onOpenOverview} />}
    {result?.status === 'history_unverifiable' && <StateCard title="Problem identity is incomplete" message="At least one accepted submission has no contest ID. Recommendations are withheld because solved-problem filtering cannot be guaranteed." onOpenOverview={onOpenOverview} />}
    {result?.status === 'catalog_limited' && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Only {result.recommendations.length} eligible unsolved problems are available in the saved catalog. Sync again after the catalog refreshes to see more.</p>}
    {result && result.recommendations.length > 0 && <ol className="space-y-4">{result.recommendations.map((problem, index) => <li key={`${problem.contest_id}-${problem.problem_index}`} className="rounded-2xl border border-white/10 bg-[#111929] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-400/10 text-xs font-semibold text-indigo-200">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{problem.name}</h3><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-400">{problem.rating ?? 'Unrated'}</span></div><p className="mt-2 text-xs text-slate-400">{problem.contest_id}{problem.problem_index} · Focus: <span className="text-indigo-200">{problem.target_topic}</span> · {problem.tags.slice(0, 3).join(', ')}</p></div><a href={problem.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Open problem <ArrowUpRight size={15} /></a></div>
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-5 sm:grid-cols-4">{featureLabels.map(([key, label]) => <div key={key} className="rounded-lg bg-[#0b1220] p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-200">+{problem.contributions[key].toFixed(2)}</p></div>)}</div><div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>Deterministic rank score</span><strong className="text-sm text-indigo-200">{problem.rank_score.toFixed(2)} / 100</strong></div><details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer font-medium text-indigo-200">Why this problem?</summary><ul className="mt-3 list-disc space-y-1 pl-4">{problem.rationale.map((line) => <li key={line}>{line}</li>)}</ul></details>
    </li>)}</ol>}
  </div>
}

function StateCard({ title, message, onOpenOverview }: { title: string; message: string; onOpenOverview: () => void }) {
  return <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><Sparkles size={27} className="mx-auto text-indigo-300" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">{message}</p><button type="button" onClick={onOpenOverview} className="mt-5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">Go to overview</button></section>
}
