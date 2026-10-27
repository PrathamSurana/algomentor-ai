import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowUpRight, CircleAlert, RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { getAnalytics, getChallengeTree, getLinkedAccounts, getRecommendations, type RecommendationsResponse } from './api'
import { CODEFORCES_HANDLE_KEY } from './storage'

const featureLabels = [
  ['topic', 'Topic fit'], ['difficulty', 'Difficulty fit'],
  ['prerequisites', 'Prerequisites'], ['diversity', 'Diversity'],
] as const

export default function RecommendationsPage({ session, demoResult, onOpenOverview }: { session: Session | null; demoResult?: RecommendationsResponse; onOpenOverview: () => void }) {
  const [handle, setHandle] = useState(() => demoResult?.handle ?? localStorage.getItem(CODEFORCES_HANDLE_KEY))
  const [result, setResult] = useState<RecommendationsResponse | null>(demoResult ?? null)
  const [loading, setLoading] = useState(!demoResult && Boolean(handle))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [topic, setTopic] = useState('all')

  useEffect(() => {
    if (demoResult) { setHandle(demoResult.handle); setResult(demoResult); setLoading(false); return }
    if (!session) return
    let active = true
    getLinkedAccounts(session.access_token).then((data) => {
      const linked = data.accounts.find((account) => account.platform === 'codeforces')?.username
      if (active && linked) {
        localStorage.setItem(CODEFORCES_HANDLE_KEY, linked)
        setHandle(linked)
      }
      if (active && !linked) setLoading(false)
    }).catch((cause: unknown) => {
      if (active && !handle) setError(cause instanceof Error ? cause.message : 'Could not load linked account.')
    })
    return () => { active = false }
  }, [session, handle, demoResult])

  useEffect(() => {
    if (demoResult || !session) return
    if (!handle) return
    let active = true
    Promise.all([getRecommendations(handle), getAnalytics(session.access_token).catch(() => null), getChallengeTree(session.access_token)])
      .then(([data, analytics, tree]) => {
        if (!active) return
        const assigned = new Set(tree.nodes.flatMap((node) => node.challenges.map((challenge) => `${challenge.contest_id}:${challenge.problem_index}`)))
        const candidates = analytics?.codeforces?.handle.toLowerCase() === handle.toLowerCase() ? analytics.recommendations : data.recommendations
        setResult({ ...data, recommendations: candidates.filter((problem) => !assigned.has(`${problem.contest_id}:${problem.problem_index}`)) })
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load recommendations.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [handle, attempt, session, demoResult])

  function retry() {
    setLoading(true)
    setError(null)
    setResult(null)
    setAttempt((value) => value + 1)
  }

  const problems = result?.recommendations ?? []
  const topics = [...new Set(problems.map((problem) => problem.target_topic))].sort()
  const filtered = problems.filter((problem) => {
    const matchesQuery = `${problem.name} ${problem.contest_id}${problem.problem_index} ${problem.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesTopic = topic === 'all' || problem.target_topic === topic
    const matchesDifficulty = difficulty === 'all' || (difficulty === 'unrated' ? problem.rating === null : problem.rating !== null && (difficulty === 'easy' ? problem.rating < 1200 : difficulty === 'medium' ? problem.rating >= 1200 && problem.rating < 1800 : problem.rating >= 1800))
    return matchesQuery && matchesTopic && matchesDifficulty
  })

  return <div className="mt-9 space-y-6">
    <section className="ui-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">{demoResult ? 'Sample recommendations · Demo Student' : 'Personalized practice'}</p><h2 className="mt-2 text-2xl font-semibold">Problems worth your time</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{demoResult ? 'Genuine public Codeforces problems with illustrative fit scores. Required roadmap challenges and optional practice are labeled separately.' : 'Unsolved Codeforces problems ranked by topic priority, difficulty fit, prerequisites, and variety. Mandatory roadmap challenges are tracked separately in the skill tree.'}</p></div>{handle && !demoResult && <button type="button" onClick={retry} disabled={loading} className="ui-button ui-button-secondary disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>}</div>
      {result?.target_rating !== null && result?.target_rating !== undefined && <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-indigo-400/10 px-3 py-1.5 text-indigo-200">Target rating {result.target_rating}</span><span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Based on {result.target_rating_source}</span>{result.cold_start && <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-200">Starter path</span>}</div>}
      {result?.synced_at && <p className="mt-4 text-xs text-slate-500">Based on history synced {new Date(result.synced_at).toLocaleString()}. Sync again after new solves to update this list.</p>}
    </section>

    {!handle && !demoResult && <StateCard title="Connect a public handle" message="Sync a Codeforces handle on the overview page to get recommendations from your stored history." onOpenOverview={onOpenOverview} />}
    {loading && <div role="status" className="grid gap-4 md:grid-cols-2"><span className="sr-only">Ranking unsolved problems…</span><div className="ui-skeleton h-60" /><div className="ui-skeleton h-60" /></div>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-200"><CircleAlert size={19} /><span className="flex-1">{error}</span><button type="button" onClick={retry} className="rounded-lg border border-rose-300/20 px-3 py-2">Retry</button></div>}
    {result?.status === 'history_incomplete' && <StateCard title="Finish importing history" message="Older submission pages remain. Load them from Overview before recommendations are shown, so previously solved problems stay out of the list." onOpenOverview={onOpenOverview} />}
    {result?.status === 'history_unverifiable' && <StateCard title="Problem identity is incomplete" message="At least one accepted submission has no contest ID. Recommendations are withheld because solved-problem filtering cannot be guaranteed." onOpenOverview={onOpenOverview} />}
    {result?.status === 'catalog_limited' && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Only {result.recommendations.length} eligible unsolved problems are available in the saved catalog. Sync again after the catalog refreshes to see more.</p>}
    {problems.length > 0 && <><section className="ui-card p-4 sm:p-5"><div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={17} className="text-violet-300" /> Refine your list <span className="ml-auto text-xs font-normal text-slate-400">{filtered.length} of {problems.length}</span></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_190px]"><label className="relative"><span className="sr-only">Search problems</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="ui-input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, ID, or tag" /></label><label><span className="sr-only">Difficulty</span><select className="ui-input" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">All difficulties</option><option value="easy">Below 1200</option><option value="medium">1200–1799</option><option value="hard">1800+</option><option value="unrated">Unrated</option></select></label><label><span className="sr-only">Topic</span><select className="ui-input" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">All topics</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div></section>{filtered.length === 0 && <div className="ui-card p-10 text-center text-sm text-slate-400">No problems match these filters. Try a broader search.</div>}<ol className="grid gap-4 xl:grid-cols-2">{filtered.map((problem) => <li key={`${problem.contest_id}-${problem.problem_index}`} className="ui-card ui-card-hover fade-in flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><span className="ui-badge">{problem.rating ?? 'Unrated'}</span><span className="ml-2 text-xs text-slate-500">{problem.contest_id}{problem.problem_index}</span>{demoResult && <span className="ml-2 text-xs font-semibold text-teal-200">{(problem as {category?: string}).category === 'mandatory_roadmap' ? 'Required roadmap' : 'Optional practice'}</span>}</div><a href={problem.url} target="_blank" rel="noreferrer" aria-label={`Open ${problem.name} on Codeforces`} className="rounded-lg p-2 text-violet-300 hover:bg-violet-400/10"><ArrowUpRight size={18} /></a></div><h3 className="mt-4 text-lg font-semibold">{problem.name}</h3><p className="mt-2 text-xs text-slate-400">Focus: <span className="text-violet-200">{problem.target_topic}</span> · {problem.tags.slice(0, 3).join(' · ')}</p><p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-slate-300">{problem.rationale[0]}</p>
      <div className="mt-auto pt-5"><div className="flex items-center justify-between text-xs text-slate-400"><span>Recommendation fit</span><strong className="text-violet-200">{problem.rank_score.toFixed(1)} / 100</strong></div><div className="ui-progress mt-2"><span style={{width:`${Math.max(0, Math.min(problem.rank_score, 100))}%`}} /></div><details className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-400"><summary className="cursor-pointer font-semibold text-violet-200">Why this problem?</summary><ul className="mt-3 list-disc space-y-1.5 pl-4">{problem.rationale.map((line) => <li key={line}>{line}</li>)}</ul><div className="mt-4 grid grid-cols-2 gap-2">{featureLabels.map(([key, label]) => <div key={key} className="rounded-lg bg-white/[0.035] p-2"><span>{label}</span><strong className="ml-2 text-slate-200">+{problem.contributions[key].toFixed(2)}</strong></div>)}</div></details><a href={problem.url} target="_blank" rel="noreferrer" className="ui-button ui-button-primary mt-5 w-full">Open on Codeforces <ArrowUpRight size={15} /></a></div>
    </li>)}</ol></>}
  </div>
}

function StateCard({ title, message, onOpenOverview }: { title: string; message: string; onOpenOverview: () => void }) {
  return <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><Sparkles size={27} className="mx-auto text-indigo-300" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">{message}</p><button type="button" onClick={onOpenOverview} className="mt-5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400">Go to overview</button></section>
}
